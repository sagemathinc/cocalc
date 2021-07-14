/*
Compute client for use in Kubernetes cluster by the hub.

The hub uses this module to get information about a project.  This is meant
to be used as part of kucalc, and replaces the other variants.

What this modules should acomplish:

- **Modify database** in response to requests to start/stop/etc project.
- Provide the project secret token to the hub.
- A few other things that also depend a lot on where cocalc is running:
   - directory_listing fallback
   - copying files around
   - reading/writing files
*/

const HUB_SERVER_PORT = 6000;
const BROWSER_SERVER_PORT = 6001;
const SAGE_SERVER_PORT = 6002;

import { EventEmitter } from "events";
import * as request from "request";
import { series } from "async";
import { debounce, isEqual } from "lodash";

// For now, we keep the defaults/required redundancy until all client code is in
// typescript, since much is still in CoffeeScript.
import {
  defaults,
  required,
  merge,
  uuid,
  retry_until_success,
} from "smc-util/misc";

import { site_license_hook } from "../postgres/site-license/hook";
import { quota } from "smc-util/upgrades/quota";
import getLogger from "smc-hub/logger";

const winston = getLogger("project-control");

export function get_json(url, cb) {
  request.get(url, function (err, response, body) {
    if (err) {
      cb(err);
    } else if (response.statusCode !== 200) {
      cb(`ERROR: statusCode ${response.statusCode}`);
    } else {
      try {
        cb(undefined, JSON.parse(body));
      } catch (e) {
        cb(`ERROR: invalid JSON -- ${e} -- '${body}'`);
      }
    }
  });
}

export function get_file(url, cb) {
  request.get(url, { encoding: null }, function (err, response, body) {
    if (err) {
      cb(err);
    } else if (response.statusCode !== 200) {
      cb(`ERROR: statusCode ${response.statusCode}`);
    } else {
      cb(undefined, body);
    }
  });
}

export function compute_client(db): Client {
  return new Client(db);
}

const project_cache = {};

class Client {
  public readonly database;
  private _synctable;
  private _synctable_cbs;

  constructor(database) {
    this.database = database;
    this.dbg("constructor")();
    if (this.database == null) {
      throw Error("database must be defined");
    }
  }

  private copy_paths_synctable(cb: Function): void {
    if (this._synctable) {
      cb(undefined, this._synctable);
      return;
    }
    if (this._synctable_cbs != null) {
      this._synctable_cbs.push(cb);
      return;
    }
    this._synctable_cbs = [cb];
    this.database.synctable({
      table: "copy_paths",
      columns: ["id", "started", "error", "finished"],
      where: {
        "time > $::TIMESTAMP": new Date(),
      },
      where_function() {
        // Whenever anything *changes* in this table, we are interested in it, so no need
        // to do a query to decide.
        return true;
      },
      cb: (err, synctable) => {
        for (cb of this._synctable_cbs) {
          if (err) {
            cb(err);
          } else {
            cb(undefined, synctable);
          }
        }
        this._synctable = synctable;
        delete this._synctable_cbs;
      },
    });
  }

  dbg(f: string): Function {
    return (...args) => winston.debug(`kucalc.Client.${f}`, ...args);
  }

  project(opts: { project_id: string; cb: Function }): void {
    opts = defaults(opts, {
      project_id: required,
      cb: required,
    });
    const dbg = this.dbg(`project('${opts.project_id}')`);
    let P = project_cache[opts.project_id];
    if (P != null) {
      dbg("in cache");
      if (P.is_ready) {
        P.active();
        opts.cb(undefined, P);
      } else {
        P.once("ready", (err) => opts.cb(err, P));
      }
      return;
    }
    dbg("not in cache, so creating");
    P = project_cache[opts.project_id] = new Project(
      this,
      opts.project_id,
      this.database
    );
    P.once("ready", () => opts.cb(undefined, P));
  }
}

// NOTE: I think (and am assuming) that EventEmitter aspect of Project is
// NOT used in KuCalc by any client code.
class Project extends EventEmitter {
  private client: Client;
  private project_id: string;
  private database;
  private active: () => void;
  public is_ready: boolean = false;
  private synctable?;
  private host?: string; // ip address of project, when known.

  constructor(client: Client, project_id: string, database) {
    super();
    this.client = client;
    this.project_id = project_id;
    this.database = database;
    const dbg = this.dbg("constructor");
    dbg("initializing");

    // We debounce the free function (which cleans everything up).
    // Every time we're doing something, we call @active();
    // once we DON'T call it for a few minutes, the project
    // is **then** freed, because that's how debounce works.
    this.active = debounce(this.free, 10 * 60 * 1000);
    this.active();
    this.database.synctable({
      table: "projects",
      columns: ["state", "status", "action_request"],
      where: { "project_id = $::UUID": this.project_id },
      where_function: (project_id) => {
        return project_id === this.project_id;
      }, // fast easy test for matching
      cb: (err, synctable) => {
        this.active();
        if (err) {
          dbg("error creating synctable ", err);
          this.emit("ready", err);
        } else {
          dbg("successfully created synctable; now ready");
          this.is_ready = true;
          this.synctable = synctable;
          this.host = this.getIn(["state", "ip"]);
          this.synctable?.on("change", () => {
            this.host = this.getIn(["state", "ip"]);
            this.emit("change");
          });
          this.emit("ready");
        }
      },
    });
  }

  // Get current data about the project from the database.
  get(field?: string) {
    const t = this.synctable.get(this.project_id);
    if (field != null) {
      return t?.get(field);
    } else {
      return t;
    }
  }

  getIn(v) {
    return this.get()?.getIn(v);
  }

  // only used internally by testing code that probably doesn't work...
  _action_request(): {
    action?: "restart" | "stop" | "save" | "close";
    err?: string;
    started?: Date;
    finished?: Date;
  } {
    const x = this.get("action_request")?.toJS() ?? {};
    if (x.started != null) {
      x.started = new Date(x.started);
    }
    if (x.finished != null) {
      x.finished = new Date(x.finished);
    }
    return x;
  }

  dbg(f: string): Function {
    return (...args) => winston.debug(`kucalc.Project.${f}`, ...args);
  }

  // free -- stop listening for status updates from the database and broadcasting
  // updates about this project.
  free(): void {
    this.dbg("free")();
    // Ensure that next time this project gets requested, a fresh one is created,
    // rather than this cached one, which has been free'd up, and will no longer work.
    delete project_cache[this.project_id];
    // Close the changefeed, so get no further data from database.
    this.synctable?.close();
    delete this.synctable;
    // Make sure nothing else reacts to changes on this ProjectClient,
    // since they won't happen.
    this.removeAllListeners();
  }

  state(opts: { force?: boolean; update?: boolean; cb: Function }): void {
    opts = defaults(opts, {
      force: false, // ignored
      update: false, // ignored
      cb: required,
    }); // cb(err, {state:?, time:?, error:?})
    const dbg = this.dbg("state");
    dbg();
    opts.cb(undefined, this.get("state")?.toJS());
  }

  status(opts: { cb: Function }): void {
    opts = defaults(opts, { cb: required });
    const dbg = this.dbg("status");
    dbg();
    const status = this.get("status")?.toJS() ?? {};
    merge(status, {
      // merge in canonical information (for KuCalc).
      "hub-server.port": HUB_SERVER_PORT,
      "browser-server.port": BROWSER_SERVER_PORT,
      "sage_server.port": SAGE_SERVER_PORT,
    });
    opts.cb(undefined, status);
  }

  _action = async (opts: {
    action: string;
    goal;
    timeout_s?: number;
    cb?: Function;
  }): Promise<void> => {
    opts = defaults(opts, {
      action: required, // action to do
      goal: required, // wait until goal(project) is true, where project is immutable js obj
      timeout_s: 300, // timeout in seconds (only used for wait)
      cb: undefined,
    });
    const dbg = this.dbg(`_action('${opts.action}')`);
    if (opts.goal(this.get())) {
      dbg("condition already holds; nothing to do.");
      opts.cb?.();
      return;
    }

    dbg("start waiting for goal to be satisfied");
    this.active();
    this.synctable.wait({
      until: () => {
        this.active();
        return opts.goal(this.get());
      },
      timeout: opts.timeout_s,
      cb: (err) => {
        this.active();
        dbg(`done waiting for goal ${err}`);
        opts.cb?.(err);
        delete opts.cb;
      },
    });

    if (opts.action === "start") {
      try {
        await site_license_hook(this.database, this.project_id);
      } catch (err) {
        // ignore - don't not start the project just because
        // of a database issue/bug...
        dbg(`ERROR in site license hook ${err}`);
      }
    }

    dbg("request action to happen");
    this.active();
    this.query({
      jsonb_set: {
        action_request: {
          action: opts.action,
          time: new Date(),
          started: undefined,
          finished: undefined,
        },
      },
      cb: (err) => {
        this.active();
        if (err) {
          dbg("action request failed");
          opts.cb?.(err);
          delete opts.cb;
        } else {
          dbg("action requested");
        }
      },
    });
  };

  private query(opts: object): void {
    opts["query"] = "UPDATE projects";
    opts["where"] = { "project_id  = $::UUID": this.project_id };
    this.client.database._query(opts);
  }

  open(opts: { cb?: Function }): void {
    opts = defaults(opts, { cb: undefined });
    const dbg = this.dbg("open");
    dbg();
    this._action({
      action: "open",
      goal: (project) =>
        (project?.getIn(["state", "state"]) ?? "closed") != "closed",
      cb: opts.cb,
    });
  }

  start(opts: { set_quotas?: boolean; cb?: Function }): void {
    opts = defaults(opts, {
      set_quotas: true, // ignored
      cb: undefined,
    });
    const dbg = this.dbg("start");
    dbg();
    this._action({
      action: "start",
      goal(project) {
        return project?.getIn(["state", "state"]) === "running";
      },
      cb: opts.cb,
    });
  }

  stop(opts: { cb: Function }): void {
    opts = defaults(opts, { cb: undefined });
    const dbg = this.dbg("stop");
    dbg();
    this._action({
      action: "stop",
      goal(project) {
        const state = project?.getIn(["state", "state"]);
        return state == "opened" || state == "closed";
      },
      cb: opts.cb,
    });
  }

  restart(opts: { set_quotas?: boolean; cb?: Function }): void {
    opts = defaults(opts, {
      set_quotas: true, // ignored
      cb: undefined,
    });
    const dbg = this.dbg("restart");
    dbg();
    series(
      [
        (cb) => {
          this.stop({ cb });
        },
        (cb) => {
          this.start({ cb });
        },
      ],
      (err) => opts.cb?.(err)
    );
  }

  ensure_running(opts): void {
    this.start(opts); // it's just the same
  }

  move(opts: { target?: string; force?: boolean; cb: Function }): void {
    opts = defaults(opts, {
      target: undefined, // ignored
      force: false, // ignored for now
      cb: required,
    });
    opts.cb(
      "DEPRECATED: Project.move makes no sense for Kubernetes or any other version of cocalc"
    );
  }

  address(opts: { cb: Function }): void {
    opts = defaults(opts, { cb: required });
    const dbg = this.dbg("address");
    dbg("first ensure is running");
    this.ensure_running({
      cb: (err) => {
        if (err) {
          dbg("error starting it up");
          opts.cb(err);
          return;
        }
        dbg("it is running");
        const address = {
          host: this.host,
          port: HUB_SERVER_PORT,
          secret_token: this.getIn(["status", "secret_token"]),
        };
        if (!address.secret_token) {
          err = "BUG -- running, but no secret_token!";
          dbg(err);
          opts.cb(err);
        } else {
          opts.cb(undefined, address);
        }
      },
    });
  }

  // this is a no-op for Kubernetes; this was only used for serving
  // some static websites, e.g., wstein.org, so may evolve into that...
  save(opts: { min_interval?: number; cb?: Function }): void {
    opts = defaults(opts, {
      min_interval: undefined, // ignored
      cb: undefined,
    }); // ignored
    const dbg = this.dbg(`save(min_interval:${opts.min_interval})`);
    dbg();
    return opts.cb?.();
  }

  copy_path(opts: {
    path?: string;
    target_project_id?: string;
    target_path?: string;
    overwrite_newer?: boolean;
    delete_missing?: boolean;
    backup?: boolean;
    exclude_history?: boolean;
    timeout?: number;
    bwlimit?: number;
    wait_until_done?: boolean;
    scheduled?: string | Date;
    public?: boolean;
    cb?: Function;
  }): void {
    opts = defaults(opts, {
      path: "",
      target_project_id: "",
      target_path: "", // path into project; if "", defaults to path above.
      overwrite_newer: undefined, // if true, newer files in target are copied over (otherwise, uses rsync's --update)
      delete_missing: undefined, // if true, delete files in dest path not in source, **including** newer files
      backup: undefined, // make backup files
      exclude_history: undefined,
      timeout: undefined,
      bwlimit: undefined,
      wait_until_done: true, // by default, wait until done. false only gives the ID to query the status later
      scheduled: undefined, // string (parseable by new Date()), or a Date
      public: false, // if true, will use the share server files rather than start the source project running.
      cb: undefined,
    });

    const copy_id = uuid();
    const dbg = this.dbg(`copy_path('${opts.path}', id='${copy_id}')`);

    if (!opts.target_project_id) {
      opts.target_project_id = this.project_id;
    }

    if (!opts.target_path) {
      opts.target_path = opts.path;
    }

    if (opts.scheduled && opts.scheduled instanceof Date) {
      // We have to remove the timezone info, b/c the PostgreSQL field is without timezone.
      // Ideally though, this is always UTC, e.g. "2019-08-08T18:34:49".
      const d = new Date(opts.scheduled);
      const offset = d.getTimezoneOffset() / 60;
      opts.scheduled = new Date(d.getTime() - offset);
      opts.wait_until_done = false;
      dbg(`opts.scheduled = ${opts.scheduled}`);
    }

    let synctable: any = undefined;
    dbg("copy a path using rsync from one project to another");
    this.active();
    return series(
      [
        (cb) => {
          dbg("get synctable");
          this.client.copy_paths_synctable((err, s) => {
            synctable = s;
            cb(err);
          });
        },
        (cb) => {
          this.active();
          dbg("write query requesting the copy to the database");
          this.database._query({
            query: "INSERT INTO copy_paths",
            values: {
              "id                ::UUID": copy_id,
              "time              ::TIMESTAMP": new Date(),
              "source_project_id ::UUID": this.project_id,
              "source_path       ::TEXT": opts.path,
              "target_project_id ::UUID": opts.target_project_id,
              "target_path       ::TEXT": opts.target_path,
              "overwrite_newer   ::BOOLEAN": opts.overwrite_newer,
              "public            ::BOOLEAN": opts.public,
              "delete_missing    ::BOOLEAN": opts.delete_missing,
              "backup            ::BOOLEAN": opts.backup,
              "bwlimit           ::TEXT": opts.bwlimit,
              "timeout           ::NUMERIC": opts.timeout,
              "scheduled         ::TIMESTAMP": opts.scheduled,
            },
            cb,
          });
        },
        (cb) => {
          this.active();
          if (synctable.getIn([copy_id, "finished"])) {
            dbg("copy instantly finished");
            // no way this ever happens - the server can't be that fast.
            // but just in case, logically we have to check this case.
            cb();
            return;
          }
          if (opts.wait_until_done == true) {
            dbg("waiting for copy to finish...");
            const handle_change = () => {
              this.active();
              const obj = synctable.get(copy_id);
              if (obj?.get("started")) {
                dbg("copy started...");
              }
              if (obj?.get("finished")) {
                dbg("copy finished!");
                synctable.removeListener("change", handle_change);
                cb(obj.get("error"));
              }
            };
            synctable.on("change", handle_change);
          } else {
            dbg("NOT waiting for copy to finish...");
            cb();
          }
        },
      ],
      (err) => {
        this.active();
        dbg("done", err);
        opts.cb?.(err, copy_id);
      }
    );
  }

  directory_listing(opts: {
    path?: string;
    hidden?: boolean;
    time?: number;
    start?: number;
    limit?: number;
    cb: Function;
  }): void {
    opts = defaults(opts, {
      path: "",
      hidden: false, // used
      time: undefined, // ignored/deprecated
      start: undefined, // ignored/deprecated
      limit: undefined, // ignored/deprecated
      cb: required,
    });
    const dbg = this.dbg("directory_listing");
    dbg();
    let listing = undefined;
    series(
      [
        (cb) => {
          dbg("starting project if necessary...");
          this.start({ cb });
        },
        (cb) => {
          // TODO: This URL is obviously very specific to KuCalc -- hardcoded port and base path.
          let url = `http://${this.host}:${BROWSER_SERVER_PORT}/${this.project_id}/raw/.smc/directory_listing/${opts.path}`;
          dbg(`fetching listing from '${url}'`);
          if (opts.hidden) {
            url += "?hidden=true";
          }
          retry_until_success({
            f: (cb) => {
              this.active();
              get_json(url, (err, x) => {
                listing = x;
                cb(err);
              });
            },
            max_time: 30000,
            start_delay: 2000,
            max_delay: 7000,
            cb,
          });
        },
      ],
      (err) => {
        this.active();
        opts.cb(err, listing);
      }
    );
  }

  read_file(opts: { path: string; maxsize?: number; cb: Function }): void {
    opts = defaults(opts, {
      path: required,
      maxsize: 5000000, // maximum file size in bytes to read
      cb: required,
    }); // cb(err, Buffer)
    const dbg = this.dbg(`read_file(path:'${opts.path}')`);
    dbg("read a file from disk");
    let content = undefined;
    this.active();
    series(
      [
        (cb) => {
          // (this also starts the project)
          // TODO: get listing and confirm size
          // TODO - obviusly we should just stream... so there is much less of a limit... though
          // limits are good, as this frickin' costs!
          const { dir, base } = require("path").parse(opts.path);
          if (!base) {
            cb(`not a file -- '${base}'`);
            return;
          }
          this.directory_listing({
            path: dir,
            hidden: true,
            cb: (err, listing) => {
              if (err) {
                cb(err);
              } else {
                for (let x of listing?.files != null ? listing?.files : []) {
                  if (x.name === base) {
                    if (x.size <= (opts.maxsize ?? 5000000)) {
                      cb();
                      return;
                    }
                  }
                }
                cb("file too big or not found in listing");
              }
            },
          });
        },
        (cb) => {
          if (this.host == null) {
            cb("project not running");
            return;
          }
          const url = `http://${this.host}:${BROWSER_SERVER_PORT}/${this.project_id}/raw/${opts.path}`;
          dbg(`fetching file from '${url}'`);
          retry_until_success({
            f: (cb) => {
              this.active();
              get_file(url, (err, x) => {
                content = x;
                cb(err);
              });
            },
            max_time: 30000,
            start_delay: 2000,
            max_delay: 7000,
            cb,
          });
        },
      ],
      (err) => {
        this.active();
        opts.cb(err, content);
      }
    );
  }

  /*
    set_all_quotas ensures that if the project is running and the quotas
    (except idle_timeout) have changed, then the project is restarted.
    */
  set_all_quotas(opts: { cb: Function }): void {
    opts = defaults(opts, { cb: required });
    const dbg = this.dbg("set_all_quotas");
    dbg();
    // 1. Get data about project from the database, namely:
    //     - is project currently running (if not, nothing to do)
    //     - if running, what quotas it was started with and what its quotas are now
    // 2. If quotas differ *AND* project is running, restarts project.
    this.active();
    this.database.get_project({
      project_id: this.project_id,
      columns: ["state", "users", "settings", "run_quota"],
      cb: (err, x) => {
        this.active();
        if (err) {
          dbg(`error -- ${err}`);
          opts.cb(err);
          return;
        }
        if (!["running", "starting", "pending"].includes(x.state?.state)) {
          dbg("project not active");
          opts.cb();
          return;
        }
        const cur = quota(x.settings, x.users);
        if (isEqual(x.run_quota, cur)) {
          dbg("running, but no quotas changed");
          opts.cb();
        } else {
          opts.cb();
          dbg("running and a quota changed; restart");
          // CRITICAL: do NOT wait on this before returning!  The set_all_quotas call must
          // complete quickly (in an HTTP requrest), whereas restart can easily take 20s,
          // and there is no reason to wait on this.
          this.restart({});
        }
      },
    });
  }
}
