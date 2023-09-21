/*
- it connects to the project and registers as a compute-server (sending its id number).
- it receives messages from project
- one of the messages is "connect to this path", where the path ends in .term or .ipynb
- it handles that by launching the command to create the connection.
- by default it just launches it in the same process, but it can configured to instead create a docker container to handle the connection
- another message is "disconnect from this path".  That closes the connection or stops the docker container.
- compute server
*/

import { ClientFs as SyncClient } from "@cocalc/sync-client/lib/client-fs";
import { SYNCDB_PARAMS, encodeIntToUUID } from "@cocalc/util/compute/manager";
import debug from "debug";
import { jupyter } from "./jupyter";
import { terminal } from "./terminal";
import { once } from "@cocalc/util/async-utils";
import { dirname } from "path";

const logger = debug("cocalc:compute:manager");

const STATUS_INTERVAL_MS = 15000;

interface Options {
  project_id: string;
  // the id number of this manager, should be the id in the database from the compute_servers table.
  compute_server_id: number;
  // HOME = local home directory.  This should be a network mounted (or local)
  // filesystem that is identical to the home directory of the target project.
  // The ipynb file will be loaded and saved from here, and must exist, and
  // process.env.HOME gets set to this.
  home?: string;
}

process.on("exit", () => {
  console.trace("manager has exited");
});

export function manager(opts: Options) {
  return new Manager(opts);
}

class Manager {
  private sync_db;
  private project_id: string;
  private home: string;
  private compute_server_id: number;
  private connections: { [path: string]: any } = {};
  private websocket;
  private client;

  constructor({
    project_id,
    compute_server_id,
    home = process.env.HOME ?? "/home/user",
  }: Options) {
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.home = home;
    process.env.HOME = home;
  }

  init = async () => {
    const client_id = encodeIntToUUID(this.compute_server_id);
    this.client = new SyncClient({
      project_id: this.project_id,
      client_id,
      home: this.home,
    });
    this.websocket = await this.client.project_client.websocket(
      this.project_id,
    );
    this.sync_db = this.client.sync_client.sync_db({
      project_id: this.project_id,
      ...SYNCDB_PARAMS,
    });
    this.sync_db.on("change", this.handleSyncdbChange);
    if (this.sync_db.get_state() == "init") {
      await once(this.sync_db, "ready");
    }
    setInterval(this.reportStatus, STATUS_INTERVAL_MS);
  };

  disconnectAll = () => {
    for (const path in this.connections) {
      this.ensureDisconnected(path);
    }
  };

  private log = (func, ...args) => {
    logger(`Manager.${func}`, ...args);
  };

  private handleSyncdbChange = (changes) => {
    this.log("handleSyncdbChange", "changes = ", changes.toJS());
    for (const key of changes) {
      const record = this.sync_db.get_one(key);
      const id = record?.get("id");
      if (id == this.compute_server_id) {
        this.ensureConnected(key.get("path"));
      } else if (id == null) {
        this.ensureDisconnected(key.get("path"));
      }
    }
  };

  private ensureConnected = (path) => {
    this.log("ensureConnected", { path });
    if (this.connections[path] == null) {
      this.connections[path] = "connecting";
      if (path.endsWith(".term")) {
        this.connections[path] = terminal({
          websocket: this.websocket,
          path,
          cwd: dirname(path),
        });
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
    this.log("ensureDisconnected", { path });
    const conn = this.connections[path];
    if (conn != null) {
      delete this.connections[path];
      conn.close();
    }
  };

  private reportStatus = () => {
    this.log("reportStatus");
    // todo -- will put system load and other info here too
    this.sync_db.set_cursor_locs([
      {
        status: "running",
        // fake for dev
        uptime:
          "00:04:17 up 10 days,  6:39,  0 users,  load average: 2.65, 2.74, 2.72",
      },
    ]);
  };
}
