/*
- it connects to the project and registers as a compute-server (sending its id number).
- it receives messages from project
- one of the messages is "connect to this path", where the path ends in .term or .ipynb
- it handles that by launching the command to create the connection.
- by default it just launches it in the same process, but it can configured to instead create a docker container to handle the connection
- another message is "disconnect from this path".  That closes the connection or stops the docker container.
- compute server


---

*/

import { ClientFs as SyncClient } from "@cocalc/sync-client/lib/client-fs";
import { SYNCDB_PARAMS, encodeIntToUUID } from "@cocalc/util/compute/manager";
import debug from "debug";
import { project } from "@cocalc/api-client";
import { jupyter } from "./jupyter";
import { terminal } from "./terminal";
import { once } from "@cocalc/util/async-utils";
import { dirname, join } from "path";
import { userInfo } from "os";
import { waitUntilFilesystemIsOfType } from "./util";
import { apiCall } from "@cocalc/api-client";
import { get_blob_store as initJupyterBlobStore } from "@cocalc/jupyter/blobs";
import { delay } from "awaiting";

const logger = debug("cocalc:compute:manager");

const STATUS_INTERVAL_MS = 20 * 1000;

interface Options {
  project_id: string;
  // the id number of the comput server where this manager is running;
  // it should be the id in the database from the compute_servers table.
  compute_server_id: number;
  // HOME = local home directory.  This should be a network mounted (or local)
  // filesystem that is identical to the home directory of the target project.
  // The ipynb file will be loaded and saved from here, and must exist, and
  // process.env.HOME gets set to this.
  home: string;
  // If true, doesn't do anything until the type of the filesystem that home is
  // mounted on is of this type, e.g., "fuse".
  waitHomeFilesystemType?: string;
}

process.on("exit", () => {
  console.log("manager has exited");
});

const STARS =
  "\nBUG ****************************************************************************\n";
process.on("uncaughtException", (err) => {
  console.trace(err);
  console.error(STARS);
  console.error(`uncaughtException: ${err}`);
  console.error(err.stack);
  console.error(STARS);
});
process.on("unhandledRejection", (err) => {
  console.trace(err);
  console.error(STARS);
  console.error(typeof err);
  console.error(`unhandledRejection: ${err}`);
  console.error((err as any)?.stack);
  console.error(STARS);
});

export function manager(opts: Options) {
  return new Manager(opts);
}

class Manager {
  private state: "new" | "init" | "ready" = "new";
  private sync_db;
  private project_id: string;
  private home: string;
  private waitHomeFilesystemType?: string;
  private compute_server_id: number;
  private connections: { [path: string]: any } = {};
  private websocket;
  private client;

  constructor({
    project_id,
    compute_server_id = parseInt(process.env.COMPUTE_SERVER_ID ?? "0"),
    home = process.env.HOME ?? "/home/user",
    waitHomeFilesystemType,
  }: Options) {
    if (!project_id) {
      throw Error("project_id or process.env.PROJECT_ID must be given");
    }
    this.project_id = project_id;
    if (!compute_server_id) {
      throw Error("set the compute_server_id or process.env.COMPUTE_SERVER_ID");
    }
    this.compute_server_id = compute_server_id;
    this.home = home;
    this.waitHomeFilesystemType = waitHomeFilesystemType;
    const env = this.env();
    for (const key in env) {
      process.env[key] = env[key];
    }
  }

  init = async () => {
    if (this.state != "new") {
      throw Error("init can only be run once");
    }
    this.log("initialize the Manager");
    this.state = "init";
    // Ping to start the project and ensure there is a hub connection to it.
    await project.ping({ project_id: this.project_id });
    // wait for home direcotry filesystem to be mounted:
    if (this.waitHomeFilesystemType) {
      this.reportComponentState({
        state: "waiting",
        extra: `for ${this.home} to mount`,
        timeout: 60,
        progress: 15,
      });
      await waitUntilFilesystemIsOfType(this.home, this.waitHomeFilesystemType);
    }
    // initialize the blobstore
    await initJupyterBlobStore();
    // connect to the project for participating in realtime sync
    const client_id = encodeIntToUUID(this.compute_server_id);
    this.client = new SyncClient({
      project_id: this.project_id,
      client_id,
      home: this.home,
    });
    this.reportComponentState({
      state: "connecting",
      extra: "to project",
      progress: 30,
      timeout: 30,
    });
    this.websocket = await this.client.project_client.websocket(
      this.project_id,
    );
    this.websocket.on("state", (state) => {
      if (state == "online" && this.sync_db?.get_state() == "ready") {
        this.log("just connected -- make sure everything configured properly.");
        for (const record of this.sync_db.get()) {
          if (record.get("id") == this.compute_server_id) {
            if (record.get("open")) {
              this.ensureConnected(record.get("path"));
            }
          } else {
            this.ensureDisconnected(record.get("path"));
          }
        }
      }
    });
    await this.initSyncDB();
    this.state = "ready";
    this.reportComponentState({
      state: "ready",
      progress: 100,
      timeout: Math.ceil(STATUS_INTERVAL_MS / 1000 + 3),
    });
    setInterval(this.reportStatus, STATUS_INTERVAL_MS);
  };

  private initSyncDB = async () => {
    this.sync_db = this.client.sync_client.sync_db({
      project_id: this.project_id,
      ...SYNCDB_PARAMS,
    });
    this.sync_db.on("change", this.handleSyncdbChange);
    this.sync_db.on("error", async (err) => {
      // This could MAYBE possibly very rarely happen if you click to restart a project, then immediately
      // close the browser tab, then try to connect compute server to it and there's a broken socket,
      // which is in a cache but not yet tested and removed...  Just try again.
      this.log("sync_db", "ERROR -- ", `${err}`);
      this.log("Will ping, then initialize syncDB again in a few seconds...");
      await project.ping({ project_id: this.project_id });
      await delay(5000);
      this.initSyncDB();
    });
    if (this.sync_db.get_state() == "init") {
      await once(this.sync_db, "ready");
    }
  };

  disconnectAll = () => {
    for (const path in this.connections) {
      this.ensureDisconnected(path);
    }
  };

  private log = (func, ...args) => {
    logger(`Manager.${func}`, ...args);
  };

  private reportComponentState = async (opts: {
    state;
    extra?;
    timeout?;
    progress?;
  }) => {
    this.log("reportState", opts);
    try {
      await apiCall("v2/compute/set-detailed-state", {
        id: this.compute_server_id,
        name: "compute",
        ...opts,
      });
    } catch (err) {
      this.log("reportState: WARNING -- ", err);
    }
  };

  private handleSyncdbChange = (changes) => {
    this.log("handleSyncdbChange", "changes = ", changes.toJS());
    for (const key of changes) {
      const record = this.sync_db.get_one(key);
      const id = record?.get("id");
      if (id == this.compute_server_id) {
        if (record.get("open")) {
          this.ensureConnected(key.get("path"));
        }
      } else {
        this.ensureDisconnected(key.get("path"));
      }
    }
  };

  private ensureConnected = (path) => {
    this.log("ensureConnected", path);
    if (this.connections[path] == null) {
      this.connections[path] = "connecting";
      if (path.endsWith(".term")) {
        const term = terminal({
          websocket: this.websocket,
          path,
          cwd: this.cwd(path),
          env: this.env(),
        });
        term.on("closed", () => {
          delete this.connections[path];
        });
        this.connections[path] = term;
      } else if (path.endsWith(".ipynb")) {
        this.connections[path] = jupyter({
          client: this.client,
          path,
        });
      } else {
        delete this.connections[path];
        this.setError({
          path,
          message: "only term and ipynb files are supported",
        });
      }
    }
  };

  private setError = ({ path, message }) => {
    this.sync_db.set({
      path,
      error: message,
    });
    this.sync_db.commit();
  };

  private ensureDisconnected = (path) => {
    this.log("ensureDisconnected", path);
    const conn = this.connections[path];
    if (conn != null) {
      delete this.connections[path];
      conn.close();
    }
  };

  private reportStatus = () => {
    this.log("reportStatus");
    // Ping to start the project and ensure there is a hub connection to it.
    project.ping({ project_id: this.project_id });
    // todo -- will put system load and other info here too
    this.sync_db.set_cursor_locs([
      {
        status: "running",
        //// fake for dev
        //uptime:
        //  "00:04:17 up 10 days,  6:39,  0 users,  load average: 2.65, 2.74, 2.72",
      },
    ]);
    this.reportComponentState({
      state: "ready",
      progress: 100,
      timeout: STATUS_INTERVAL_MS + 3,
    });
  };

  private env = () => {
    return {
      HOME: this.home ?? "/home/user",
      COCALC_PROJECT_ID: this.project_id,
      COCALC_USERNAME: userInfo().username,
      COMPUTE_SERVER_ID: `${this.compute_server_id}`,
    };
  };

  private cwd = (path) => {
    return join(this.home, dirname(path));
  };
}
