/*
The manager does the following:

- Waits until the filesystem is mounted
- Then connects to Conat in the same way as a project, but with compute_server_id positive.

*/

import debug from "debug";
import startProjectServers from "@cocalc/project/conat";
import { pingProjectUntilSuccess, waitUntilFilesystemIsOfType } from "./util";
import { apiCall, project } from "@cocalc/api-client";

const logger = debug("cocalc:compute:manager");

const STATUS_INTERVAL_MS = 20 * 1000;

interface Options {
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
  private project_id: string;
  private home: string;
  private waitHomeFilesystemType?: string;
  private compute_server_id: number;

  constructor({ waitHomeFilesystemType }: Options) {
    this.waitHomeFilesystemType = waitHomeFilesystemType;
    // default so that any windows that any user apps in terminal or jupyter run will
    // automatically just work in xpra's X11 desktop.... if they happen to be running it.
    process.env.DISPLAY = ":0";
    if (!process.env.COMPUTE_SERVER_ID) {
      throw Error("env variable COMPUTE_SERVER_ID must be set");
    }
    this.compute_server_id = parseInt(process.env.COMPUTE_SERVER_ID);
    if (!process.env.HOME) {
      throw Error("HOME must be set");
    }
    this.home = process.env.HOME;
  }

  init = async () => {
    if (this.state != "new") {
      throw Error("init can only be run once");
    }
    this.log("initialize the Manager");
    this.state = "init";
    // Ping to start the project and ensure there is a hub connection to it.
    await pingProjectUntilSuccess(this.project_id);
    // wait for home directory file system to be mounted:
    if (this.waitHomeFilesystemType) {
      this.reportComponentState({
        state: "waiting",
        extra: `for ${this.home} to mount`,
        timeout: 60,
        progress: 15,
      });
      await waitUntilFilesystemIsOfType(this.home, this.waitHomeFilesystemType);
    }

    await startProjectServers();

    this.state = "ready";
    this.reportComponentState({
      state: "ready",
      progress: 100,
      timeout: Math.ceil(STATUS_INTERVAL_MS / 1000 + 3),
    });
    setInterval(this.reportStatus, STATUS_INTERVAL_MS);
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

  private reportStatus = async () => {
    this.log("reportStatus");
    // Ping to start the project and ensure there is a hub connection to it.
    try {
      await project.ping({ project_id: this.project_id });
      this.log("ping project -- SUCCESS");
    } catch (err) {
      this.log(`ping project -- ERROR '${err}'`);
      return;
    }
    this.reportComponentState({
      state: "ready",
      progress: 100,
      timeout: STATUS_INTERVAL_MS + 3,
    });
  };
}
