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

import { defaults, required } from "smc-util/misc";
import { once } from "smc-util/async-utils";
import { database } from "smc-hub/servers/database";
import { EventEmitter } from "events";
import { debounce, isEqual } from "lodash";
import { State as ProjectState } from "smc-util/compute-states";
import { ProjectStatus } from "smc-util/db-schema/projects";
import getLogger from "smc-hub/logger";

const winston = getLogger("project-control");

type Action = "open" | "start" | "stop" | "restart";

class Projects {
  public readonly project_cache: { [string]: Project } = {};

  constructor(cls: Project) {
    this.cls = cls;
  }

  async project(opts: { project_id: string }): Promise<Project> {
    opts = defaults(opts, {
      project_id: required,
    });
    let P = this.project_cache[opts.project_id];
    if (P != null) {
      winston.debug(`Got project '${opts.project_id}' from cache`);
      if (P.is_ready) {
        P.active();
        return P;
      } else {
        await once(P, "ready");
        return P;
      }
    }
    winston.debug(`Creating and caching project '${opts.project_id}'`);
    P = this.project_cache[opts.project_id] = new this.cls(
      this,
      opts.project_id
    );
    await once(P, "ready");
    return P;
  }
}

export function init(cls: Project): Projects {
  return new Projects(cls);
}

export class Project extends EventEmitter {
  private readonly projects: Projects;
  public readonly project_id: string;
  private active: () => void;
  public is_ready: boolean = false;
  private synctable?;
  private host?: string; // ip address of project, when known.

  constructor(projects: Client, project_id: string) {
    super();
    this.projects = projects;
    this.project_id = project_id;
    const dbg = this.dbg("constructor");
    dbg("initializing");

    // We debounce the free function (which cleans everything up).
    // Every time we're doing something, we call active();
    // once we DON'T call it for a few minutes, the project
    // is **then** freed, because that's how debounce works.
    this.active = debounce(this.free, 10 * 60 * 1000);
    this.active();

    this.initSynctable();
  }

  async initSynctable(): Promise<void> {
    const dbg = this.dbg("initSynctable");
    try {
      this.synctable = await database.synctable({
        table: "projects",
        columns: ["state", "status", "action_request"],
        where: { "project_id = $::UUID": this.project_id },
        where_function: (project_id) => {
          // fast easy test for matching
          return project_id === this.project_id;
        },
      });
    } catch (err) {
      dbg("error creating synctable ", err);
      this.emit("ready", err);
      return;
    }
    this.active();
    dbg("successfully created synctable; now ready");
    this.is_ready = true;
    this.host = this.getIn(["state", "ip"]);
    this.synctable?.on("change", () => {
      this.host = this.getIn(["state", "ip"]);
      this.emit("change");
    });
    this.emit("ready");
  }

  // Get current data about the project from the database.
  get(field?: string): any {
    const t = this.synctable.get(this.project_id);
    if (field != null) {
      return t?.get(field);
    } else {
      return t;
    }
  }

  getIn(v): any {
    return this.get()?.getIn(v);
  }

  dbg(f: string): Function {
    return (...args) => winston.debug(`kucalc.Project.${f}`, ...args);
  }

  // free -- stop listening for status updates from the database and broadcasting
  // updates about this project.  This is called automatically as soon as
  // this.active() doesn't get called for a few minutes.  This is purely an
  // optimization to reduce resource usage by the hub.
  private free(): void {
    this.dbg("free")();
    // Ensure that next time this project gets requested, a fresh one is created,
    // rather than this cached one, which has been free'd up, and will no longer work.
    delete this.projects.project_cache[this.project_id];
    // Close the changefeed, so get no further data from database.
    this.synctable?.close();
    delete this.synctable;
    // Make sure nothing else reacts to changes on this ProjectClient,
    // since they won't happen.
    this.removeAllListeners();
  }

  // Get the state of the project -- state is just whether or not
  // it is runnig, stopping, starting.  It's not much info.
  async state(opts: {
    force?: boolean;
    update?: boolean;
  }): Promise<{ error?: string; state?: ProjectState; time?: Date }>;

  // Get the status of the project -- status is MUCH more information
  // about the project, including ports of various services.
  async status(): Promise<ProjectStatus>;

  // Perform an action, e.g., 'start' the project.
  // Promise resolves when the goal is satisfied/true, or timeout is hit.
  // The goal is just a function of the state.
  private async action(opts: {
    action: Action;
    goal: (state: ProjectState | undefined) => boolean;
    timeout_s?: number;
  }): Promise<void>;

  async open(): Promise<void> {
    this.dbg("open")();
    await this.action({
      action: "open",
      goal: (state) => (state ?? "closed") != "closed",
    });
  }

  async start(): Promise<void> {
    this.dbg("start")();
    await this.action({
      action: "start",
      goal: (state) => state == "running",
    });
  }

  async stop(): Promise<void> {
    this.dbg("stop")();
    await this.action({
      action: "stop",
      goal: (state) => state == "opened" || state == "closed",
    });
  }

  async restart(): Promise<void> {
    this.dbg("restart")();
    await this.stop();
    await this.start();
  }

  // Everything the hub needs to know to connect to the project
  // via the TCP connection.
  async address(): Promise<{
    host: string;
    port: number;
    secret_token: string;
  }> {
    const dbg = this.dbg("address");
    dbg("first ensure is running");
    await this.start();
    dbg("it is running");
    const status = await this.status();
    return {
      host: this.host,
      port: status["hub-server.port"],
      secret_token: status.secret_token,
    };
  }

  async copy_path(opts: CopyOptions): Promise<?string> {
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
    return await this._copy_path(opts);
  }
  // Implements copy path (must be defined in derived class);
  // it can assume the params are reasonably valid (via defaults above).
  private async _copy_path(opts);

  // returns a directoy listing
  async directory_listing(opts: {
    path?: string;
    hidden?: boolean;
    time?: number;
    start?: number;
    limit?: number;
  }): Promise<any>;

  // Read a file from disk in the project.
  async read_file(opts: { path: string; maxsize?: number }): Promise<Buffer> {
    opts = defaults(opts, {
      path: required,
      maxsize: 5000000, // maximum file size in bytes to read
    });
    const dbg = this.dbg(`read_file(path:'${opts.path}')`);
    dbg("read a file from disk");
    return await this._read_file(opts);
  }

  // Must be implemented in derived class.
  async _read_file(opts: { path: string; maxsize: number }): Promise<Buffer>;

  /*
    set_all_quotas ensures that if the project is running and the quotas
    (except idle_timeout) have changed, then the project is restarted.
    */
  async set_all_quotas(): Promise<void> {
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
