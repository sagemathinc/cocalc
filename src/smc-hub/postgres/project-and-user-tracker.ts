/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

import { EventEmitter } from "events";

import { len, keys } from "../smc-util/misc2";

import { PostgreSQL } from "./types";

class ProjectAndUserTracker extends EventEmitter {
  private _db: PostgreSQL;

  // by a "set" we mean map to boolean...
  // set of accounts we care about
  private _accounts: { [account_id: string]: boolean } = {};

  constructor(_db, cb) {
    super();
    this._dbg = this._dbg.bind(this);
    this._handle_error = this._handle_error.bind(this);
    this.close = this.close.bind(this);
    this._handle_change = this._handle_change.bind(this);
    this._add_user_to_project = this._add_user_to_project.bind(this);
    this._remove_user_from_project = this._remove_user_from_project.bind(this);
    this.register = this.register.bind(this);
    this._register = this._register.bind(this);
    this.unregister = this.unregister.bind(this);
    this.projects = this.projects.bind(this);
    this.collabs = this.collabs.bind(this);
    this._db = _db;
    const dbg = this._dbg("constructor");
    dbg("Initializing Project and user tracker...");
    this.setMaxListeners(10000); // every changefeed might result in a listener on this one object.
    this._users = {}; // map from from project_id to set of users of a given project
    this._projects = {}; // map from account_id to set of projects of a given user
    this._collabs = {}; // map from account_id to map from account_ids to *number* of projects you have in common
    // create changefeed listening on changes to projects table
    this._db.changefeed({
      table: "projects",
      select: { project_id: "UUID" },
      watch: ["users"],
      where: {},
      cb: (err, feed) => {
        if (err) {
          dbg(`Error = ${err}`);
          return cb(err);
        } else {
          dbg("Done");
          this._feed = feed;
          this._feed.on("change", this._handle_change);
          this._feed.on("error", this._handle_error);
          this._feed.on("close", () => this._handle_error("changefeed closed"));
          return cb();
        }
      }
    });
  }
  _dbg(f) {
    return this._db._dbg(`Tracker.${f}`);
  }

  _handle_error(err) {
    if (this._closed) {
      return;
    }
    // There was an error in the changefeed.
    // Error is totally fatal, so we close up shop.
    const dbg = this._dbg("_handle_error");
    dbg(`err='${err}'`);
    this.emit("error", err);
    return this.close();
  }

  close() {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this.emit("close");
    this.removeAllListeners();
    if (this._feed != null) {
      this._feed.close();
    }
    return delete this._feed;
  }

  _handle_change(x) {
    let account_id, project_id;
    if (x.action === "delete") {
      ({ project_id } = x.old_val);
      if (this._users[project_id] == null) {
        // no users
        return;
      }
      for (account_id in this._users[project_id]) {
        this._remove_user_from_project(account_id, project_id);
      }
      return;
    }
    // users on a project changed or project created
    ({ project_id } = x.new_val);
    return this._db._query({
      query: "SELECT jsonb_object_keys(users) AS account_id FROM projects",
      where: { "project_id = $::UUID": project_id },
      cb: all_results("account_id", (err, users) => {
        if (err) {
          // TODO! -- will have to try again... or make a version of _query that can't fail...?
          return;
        }
        if (this._users[project_id] == null) {
          // we are not already watching this project
          let any = false;
          for (account_id of Array.from(users)) {
            if (this._accounts[account_id]) {
              any = true;
              break;
            }
          }
          if (!any) {
            // *and* none of our tracked users are on this project... so don't care
            return;
          }
        }

        // first add any users who got added, and record which accounts are relevant
        const users_now = {};
        for (account_id of Array.from(users)) {
          users_now[account_id] = true;
        }
        const users_before =
          this._users[project_id] != null ? this._users[project_id] : {};
        for (account_id in users_now) {
          if (!users_before[account_id]) {
            this._add_user_to_project(account_id, project_id);
          }
        }
        return (() => {
          const result = [];
          for (account_id in users_before) {
            if (!users_now[account_id]) {
              result.push(
                this._remove_user_from_project(account_id, project_id)
              );
            } else {
              result.push(undefined);
            }
          }
          return result;
        })();
      })
    });
  }

  // add and remove user from a project, maintaining our data structures (@_accounts, @_projects, @_collabs)
  _add_user_to_project(account_id, project_id) {
    const dbg = this._dbg("_add_user_to_project");
    if (
      (account_id != null ? account_id.length : undefined) !== 36 ||
      (project_id != null ? project_id.length : undefined) !== 36
    ) {
      // nothing to do -- better than crashing the server...
      dbg(
        `WARNING: invalid account_id (='${account_id}') or project_id (='${project_id}')`
      );
      return;
    }
    if (
      this._projects[account_id] != null
        ? this._projects[account_id][project_id]
        : undefined
    ) {
      return;
    }
    this.emit("add_user_to_project", { account_id, project_id });
    const users =
      this._users[project_id] != null
        ? this._users[project_id]
        : (this._users[project_id] = {});
    users[account_id] = true;
    const projects =
      this._projects[account_id] != null
        ? this._projects[account_id]
        : (this._projects[account_id] = {});
    projects[project_id] = true;
    const collabs =
      this._collabs[account_id] != null
        ? this._collabs[account_id]
        : (this._collabs[account_id] = {});
    return (() => {
      const result = [];
      for (let other_account_id in users) {
        if (collabs[other_account_id] != null) {
          collabs[other_account_id] += 1;
        } else {
          collabs[other_account_id] = 1;
          this.emit("add_collaborator", {
            account_id,
            collab_id: other_account_id
          });
        }
        const other_collabs = this._collabs[other_account_id];
        if (other_collabs[account_id] != null) {
          result.push((other_collabs[account_id] += 1));
        } else {
          other_collabs[account_id] = 1;
          result.push(
            this.emit("add_collaborator", {
              account_id: other_account_id,
              collab_id: account_id
            })
          );
        }
      }
      return result;
    })();
  }

  _remove_user_from_project(account_id, project_id, no_emit) {
    if (
      (account_id != null ? account_id.length : undefined) !== 36 ||
      (project_id != null ? project_id.length : undefined) !== 36
    ) {
      throw Error("invalid account_id or project_id");
    }
    if (
      !(this._projects[account_id] != null
        ? this._projects[account_id][project_id]
        : undefined)
    ) {
      return;
    }
    if (!no_emit) {
      this.emit("remove_user_from_project", { account_id, project_id });
    }
    const collabs =
      this._collabs[account_id] != null
        ? this._collabs[account_id]
        : (this._collabs[account_id] = {});
    for (let other_account_id in this._users[project_id]) {
      this._collabs[account_id][other_account_id] -= 1;
      if (this._collabs[account_id][other_account_id] === 0) {
        delete this._collabs[account_id][other_account_id];
        if (!no_emit) {
          this.emit("remove_collaborator", {
            account_id,
            collab_id: other_account_id
          });
        }
      }
      this._collabs[other_account_id][account_id] -= 1;
      if (this._collabs[other_account_id][account_id] === 0) {
        delete this._collabs[other_account_id][account_id];
        if (!no_emit) {
          this.emit("remove_collaborator", {
            account_id: other_account_id,
            collab_id: account_id
          });
        }
      }
    }
    delete this._users[project_id][account_id];
    return delete this._projects[account_id][project_id];
  }

  // Register the given account so that this client watches the database
  // in order to be aware of all projects and collaborators of the
  // given account.
  register(opts) {
    opts = defaults(opts, {
      account_id: required,
      cb: required
    });
    if (this._accounts[opts.account_id] != null) {
      // already registered
      opts.cb();
      return;
    }
    if (this._register_todo == null) {
      this._register_todo = {};
    }
    if (len(this._register_todo) === 0) {
      // no registration is currently happening
      this._register_todo[opts.account_id] = [opts.cb];
      // kick things off -- this will keep registering accounts
      // until everything is done, then set @_register_todo to undefined
      return this._register();
    } else {
      // Accounts are being registered right now.  Add to the todo list.
      const v = this._register_todo[opts.account_id];
      if (v != null) {
        return v.push(opts.cb);
      } else {
        return (this._register_todo[opts.account_id] = [opts.cb]);
      }
    }
  }

  // Call _register to completely clear the work @_register_todo work queue.
  // NOTE: _register does each account, *one after another*, rather than doing
  // everything in parallel.   WARNING: DO NOT rewrite this to do everything in parallel,
  // unless you think you thoroughly understand the algorithm, since I think
  // doing things in parallel would horribly break!
  _register() {
    const account_id = __guard__(keys(this._register_todo), x => x[0]);
    if (account_id == null) {
      // no work
      return;
    }
    // Register this account
    const dbg = this._dbg("_register");
    dbg(`registering account='${account_id}'...`);
    return this._db._query({
      query:
        "SELECT project_id, json_agg(o) as users FROM (select project_id, jsonb_object_keys(users) AS o FROM projects WHERE users ? $1::TEXT) s group by s.project_id",
      params: [account_id],
      cb: all_results((err, x) => {
        if (!err) {
          this._accounts[account_id] = true;
          for (let a of Array.from(x)) {
            if (this._users[a.project_id] != null) {
              // already have data about this project
              continue;
            } else {
              for (let collab_account_id of Array.from(a.users)) {
                // NOTE: Very rarely, sometimes collab_account_id is not defined
                if (collab_account_id != null) {
                  this._add_user_to_project(collab_account_id, a.project_id);
                }
              }
            }
          }
        }
        // call the callbacks
        if (err) {
          dbg(`error registering '${account_id}' -- err=${err}`);
        } else {
          dbg(`successfully registered '${account_id}'`);
        }
        for (let cb of Array.from(this._register_todo[account_id])) {
          if (typeof cb === "function") {
            cb(err);
          }
        }
        // We are done (trying to) register account_id, for good or ill.
        delete this._register_todo[account_id];
        if (len(this._register_todo) > 0) {
          // Deal with next account that needs to be registered
          return this._register();
        }
      })
    });
  }

  unregister(opts) {
    let project_id;
    opts = defaults(opts, { account_id: required });
    if (this._accounts[opts.account_id] == null) {
      return;
    }
    const v = [];
    for (project_id in this._projects[opts.account_id]) {
      v.push(project_id);
    }
    delete this._accounts[opts.account_id];
    // Forget about any projects they we are on that are no longer
    // necessary to watch...
    for (project_id of Array.from(v)) {
      var account_id;
      let need = false;
      for (account_id in this._users[project_id]) {
        if (this._accounts[account_id] != null) {
          need = true;
          break;
        }
      }
      if (!need) {
        for (account_id in this._users[project_id]) {
          this._remove_user_from_project(account_id, project_id, true);
        }
        delete this._users[project_id];
      }
    }
  }

  // return *set* of projects that this user is a collaborator on
  projects(account_id) {
    if (this._accounts[account_id] == null) {
      // This should never happen, but very rarely it DOES.  I do not know why, having studied the
      // code.  But when it does, just raising an exception blows up the server really badly.
      // So for now we just async register the account, return that it is not a collaborator
      // on anything.  Then some query will fail, get tried again, and work since registration will
      // have finished.
      //throw Error("account (='#{account_id}') must be registered")
      this.register({ account_id, cb() {} });
      return {};
    }
    return this._projects[account_id] != null ? this._projects[account_id] : {};
  }

  // map from collabs of account_id to number of projects they collab on (account_id itself counted twice)
  collabs(account_id) {
    return this._collabs[account_id];
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
