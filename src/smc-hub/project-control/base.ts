/*
Project control abstract base class.

The hub uses this to get information about a project and do some basic tasks.
There are different implementations for different ways in which cocalc
gets deployed.

What this modules should acomplish:

- Start/stop/restart a project.
- Provide the project secret token to the hub.
- A few other things:
   - directory_listing fallback
   - copying files around
   - reading/writing files
*/

import { defaults } from "smc-util/misc";
import { callback2 } from "smc-util/async-utils";
import { database } from "smc-hub/servers/database";
import { EventEmitter } from "events";
import { isEqual } from "lodash";
import { ProjectState, ProjectStatus } from "smc-util/db-schema/projects";
import { quota } from "smc-util/upgrades/quota";
import { delay } from "awaiting";
import getLogger from "smc-hub/logger";

export { ProjectState, ProjectStatus };

const winston = getLogger("project-control");

export type Action = "open" | "start" | "stop" | "restart";

const projectCache: { [project_id: string]: BaseProject } = {};
export function getProject(project_id: string): BaseProject | undefined {
  return projectCache[project_id];
}

export abstract class BaseProject extends EventEmitter {
  public readonly project_id: string;
  public is_ready: boolean = false;
  public is_freed: boolean = false;
  public host?: string; // ip address of project, when known.
  protected stateChanging: ProjectState | undefined = undefined;
  protected synctable?;

  constructor(project_id: string) {
    super();
    projectCache[project_id] = this;
    this.project_id = project_id;
    const dbg = this.dbg("constructor");
    dbg("initializing");
  }

  active() {}
  assertNotFreed() {}
  async waitUntilReady(): Promise<void> {}

  protected async saveStateToDatabase(state: ProjectState): Promise<void> {
    await callback2(database.set_project_state, {
      ...state,
      project_id: this.project_id,
    });
  }

  protected async saveStatusToDatabase(status: ProjectStatus): Promise<void> {
    await callback2(database.set_project_status, {
      project_id: this.project_id,
      status,
    });
  }

  // Get current data about the project from the database.
  get(field?: string): any {
    this.assertNotFreed();
    const t = this.synctable?.get(this.project_id);
    if (field != null) {
      return t?.get(field);
    } else {
      return t;
    }
  }

  getIn(v): any {
    this.assertNotFreed();
    return this.get()?.getIn(v);
  }

  dbg(f: string): Function {
    return (...args) => winston.debug(`Project.${f}`, ...args);
  }

  // Get the state of the project -- state is just whether or not
  // it is runnig, stopping, starting.  It's not much info.
  abstract state(opts?: {
    force?: boolean;
    update?: boolean;
  }): Promise<ProjectState>;

  // Get the status of the project -- status is MUCH more information
  // about the project, including ports of various services.
  abstract status(): Promise<ProjectStatus>;

  abstract start(): Promise<void>;

  abstract stop(): Promise<void>;

  async restart(): Promise<void> {
    this.dbg("restart")();
    await this.stop();
    await this.start();
  }

  protected async wait(opts: {
    until: () => Promise<boolean>;
    maxTime: number;
  }): Promise<void> {
    const { until, maxTime } = opts;
    const t0 = new Date().valueOf();
    let d = 250;
    while (new Date().valueOf() - t0 <= maxTime) {
      if (await until()) {
        winston.debug(`wait ${this.project_id} -- satisfied`);
        return;
      }
      await delay(d);
      d *= 1.2;
    }
    const err = `wait ${this.project_id} -- FAILED`;
    winston.debug(err);
    throw Error(err);
  }

  // Everything the hub needs to know to connect to the project
  // via the TCP connection.  Raises error if anything can't be
  // determined.
  async address(): Promise<{
    host: string;
    port: number;
    secret_token: string;
  }> {
    this.assertNotFreed();
    const dbg = this.dbg("address");
    dbg("first ensure is running");
    await this.start();
    dbg("it is running");
    const status = await this.status();
    if (this.host == null) {
      throw Error("unable to determine host");
    }
    if (status["hub-server.port"] == null) {
      throw Error("unable to determine hub-server port");
    }
    if (status["secret_token"] == null) {
      throw Error("unable to determine secret_token");
    }
    return {
      host: this.host,
      port: status["hub-server.port"],
      secret_token: status.secret_token,
    };
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    this.assertNotFreed();
    // Returns a copy_id string if scheduled is true.
    opts = defaults(opts, {
      path: "",
      target_project_id: "",
      target_path: "",
      overwrite_newer: undefined,
      delete_missing: undefined,
      backup: undefined,
      exclude_history: undefined,
      timeout: undefined,
      bwlimit: undefined,
      wait_until_done: true,
      scheduled: undefined,
      public: false,
    });
    return await this.doCopyPath(opts);
  }
  // Implements copy path (must be defined in derived class);
  // it can assume the params are reasonably valid (via defaults above).
  abstract doCopyPath(opts);

  // returns a directoy listing
  abstract directoryListing(opts: {
    path?: string;
    hidden?: boolean;
    time?: number;
    start?: number;
    limit?: number;
  }): Promise<any>;

  /*
    set_all_quotas ensures that if the project is running and the quotas
    (except idle_timeout) have changed, then the project is restarted.
    */
  async setAllQuotas(): Promise<void> {
    this.assertNotFreed();
    const dbg = this.dbg("set_all_quotas");
    dbg();
    // 1. Get data about project from the database, namely:
    //     - is project currently running (if not, nothing to do)
    //     - if running, what quotas it was started with and what its quotas are now
    // 2. If quotas differ *AND* project is running, restarts project.
    this.active();
    const x = await callback2(database.get_project, {
      project_id: this.project_id,
      columns: ["state", "users", "settings", "run_quota"],
    });
    this.active();
    if (!["running", "starting", "pending"].includes(x.state?.state)) {
      dbg("project not active so nothing to do");
      return;
    }
    const cur = quota(x.settings, x.users);
    if (isEqual(x.run_quota, cur)) {
      dbg("running, but no quotas changed");
      return;
    } else {
      dbg("running and a quota changed; restart");
      // CRITICAL: do NOT await on this restart!  The set_all_quotas call must
      // complete quickly (in an HTTP requrest), whereas restart can easily take 20s,
      // and there is no reason to wait on this.  Wrapping this as below calls the
      // function, properly awaits and logs what happens, and avoids uncaught exceptions,
      // but doesn't block the caller of this function.
      (async () => {
        try {
          await this.restart();
          dbg("restart worked");
        } catch (err) {
          dbg(`restart failed -- ${err}`);
        }
      })();
    }
  }
}

export interface CopyOptions {
  path?: string;
  target_project_id?: string;
  target_path?: string; // path into project; if "", defaults to path above.
  overwrite_newer?: boolean; // if true, newer files in target are copied over (otherwise, uses rsync's --update)
  delete_missing?: boolean; // if true, delete files in dest path not in source, **including** newer files
  backup?: boolean; // make backup files
  exclude_history?: boolean;
  timeout?: number;
  bwlimit?: number;
  wait_until_done?: boolean; // by default, wait until done. false only gives the ID to query the status later
  scheduled?: string | Date; // string (parseable by new Date()), or a Date
  public?: boolean; // if true, will use the share server files rather than start the source project running.
}
