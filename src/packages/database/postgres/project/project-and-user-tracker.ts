/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { callback } from "awaiting";
import { callback2 } from "@cocalc/util/async-utils";
import { close, len } from "@cocalc/util/misc";
import { PostgreSQL, QueryOptions, QueryResult } from "../types";
import { getPoolClient } from "@cocalc/database/pool";
import { ChangeEvent, Changes } from "../changefeed/changefeed";

const { all_results } = require("../../postgres-base");

type SetOfAccounts = { [account_id: string]: boolean };
type SetOfProjects = { [project_id: string]: boolean };

type State = "init" | "ready" | "closed";

export class ProjectAndUserTracker extends EventEmitter {
  private state: State = "init";

  private db: PostgreSQL;

  private feed: Changes;

  // by a "set" we mean map to boolean...
  // set of accounts we care about
  private accounts: SetOfAccounts = {};

  // map from from project_id to set of users of a given project
  private users: { [project_id: string]: SetOfAccounts } = {};

  // map from account_id to set of projects of a given user
  private projects: { [account_id: string]: SetOfProjects } = {};

  // map from account_id to map from account_ids to *number* of
  // projects the two users have in common.
  private collabs: {
    [account_id: string]: { [account_id: string]: number };
  } = {};

  private register_todo: { [account_id: string]: Function[] } = {};

  // used for a runtime sanity check
  private do_register_lock: boolean = false;

  constructor(db: PostgreSQL) {
    super();
    this.db = db;
  }

  private assert_state(state: State, f: string): void {
    if (this.state != state) {
      throw Error(`${f}: state must be ${state} but it is ${this.state}`);
    }
  }

  async init(): Promise<void> {
    this.assert_state("init", "init");
    const dbg = this.dbg("init");
    dbg("Initializing Project and user tracker...");

    // every changefeed for a user will result in a listener
    // on an event on this one object.
    this.setMaxListeners(1000);

    try {
      // create changefeed listening on changes to projects table
      this.feed = await callback2(this.db.changefeed, {
        table: "projects",
        select: { project_id: "UUID" },
        watch: ["users"],
        where: {},
      });
      dbg("Success");
    } catch (err) {
      this.handle_error(err);
      return;
    }
    this.feed.on("change", this.handle_change.bind(this));
    this.feed.on("error", this.handle_error.bind(this));
    this.feed.on("close", () => this.handle_error("changefeed closed"));
    this.set_state("ready");
  }

  private dbg(f) {
    return this.db._dbg(`Tracker.${f}`);
  }

  private handle_error(err) {
    if (this.state == "closed") return;
    // There was an error in the changefeed.
    // Error is totally fatal, so we close up shop.
    const dbg = this.dbg("handle_error");
    dbg(`err='${err}'`);
    this.emit("error", err);
    this.close();
  }

  private set_state(state: State): void {
    this.state = state;
    this.emit(state);
  }

  close() {
    if (this.state == "closed") {
      return;
    }
    this.set_state("closed");
    this.removeAllListeners();
    if (this.feed != null) {
      this.feed.close();
    }
    if (this.register_todo != null) {
      // clear any outstanding callbacks
      for (const account_id in this.register_todo) {
        const callbacks = this.register_todo[account_id];
        if (callbacks != null) {
          for (const cb of callbacks) {
            cb("closed - project-and-user-tracker");
          }
        }
      }
    }
    close(this);
    this.state = "closed";
  }

  private handle_change_delete(old_val): void {
    this.assert_state("ready", "handle_change_delete");
    const { project_id } = old_val;
    if (this.users[project_id] == null) {
      // no users, so nothing to worry about.
      return;
    }
    for (const account_id in this.users[project_id]) {
      this.remove_user_from_project(account_id, project_id);
    }
    return;
  }

  private handle_change(x: ChangeEvent): void {
    this.assert_state("ready", "handle_change");
    if (x.action === "delete") {
      if (x.old_val == null) return; // should never happen
      this.handle_change_delete(x.old_val);
    } else {
      if (x.new_val == null) return; // should never happen
      this.handle_change_update(x.new_val);
    }
  }

  private async handle_change_update(new_val): Promise<void> {
    this.assert_state("ready", "handle_change_update");
    const dbg = this.dbg("handle_change_update");
    dbg(new_val);
    // users on a project changed or project created
    const { project_id } = new_val;
    let users: QueryResult<{ account_id: string }>[];
    try {
      users = await query<{ account_id: string }>(this.db, {
        query: "SELECT jsonb_object_keys(users) AS account_id FROM projects",
        where: { "project_id = $::UUID": project_id },
      });
    } catch (err) {
      this.handle_error(err);
      return;
    }
    if (this.users[project_id] == null) {
      // we are not already watching this project
      let any = false;
      for (const { account_id } of users) {
        if (this.accounts[account_id]) {
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
    const users_now: SetOfAccounts = {};
    for (const { account_id } of users) {
      users_now[account_id] = true;
    }
    const users_before: SetOfAccounts =
      this.users[project_id] != null ? this.users[project_id] : {};
    for (const account_id in users_now) {
      if (!users_before[account_id]) {
        this.add_user_to_project(account_id, project_id);
      }
    }
    for (const account_id in users_before) {
      if (!users_now[account_id]) {
        this.remove_user_from_project(account_id, project_id);
      }
    }
  }

  // add and remove user from a project, maintaining our data structures
  private add_user_to_project(account_id: string, project_id: string): void {
    this.assert_state("ready", "add_user_to_project");
    if (
      this.projects[account_id] != null &&
      this.projects[account_id][project_id]
    ) {
      // already added
      return;
    }
    this.emit(`add_user_to_project-${account_id}`, project_id);
    if (this.users[project_id] == null) {
      this.users[project_id] = {};
    }
    const users = this.users[project_id];
    users[account_id] = true;

    if (this.projects[account_id] == null) {
      this.projects[account_id] = {};
    }
    const projects = this.projects[account_id];
    projects[project_id] = true;

    if (this.collabs[account_id] == null) {
      this.collabs[account_id] = {};
    }
    const collabs = this.collabs[account_id];

    for (const other_account_id in users) {
      if (collabs[other_account_id] != null) {
        collabs[other_account_id] += 1;
      } else {
        collabs[other_account_id] = 1;
        this.emit(`add_collaborator-${account_id}`, other_account_id);
      }
      const other_collabs = this.collabs[other_account_id];
      if (other_collabs[account_id] != null) {
        other_collabs[account_id] += 1;
      } else {
        other_collabs[account_id] = 1;
        this.emit(`add_collaborator-${other_account_id}`, account_id);
      }
    }
  }

  private remove_user_from_project(
    account_id: string,
    project_id: string,
    no_emit: boolean = false,
  ): void {
    this.assert_state("ready", "remove_user_from_project");
    if (
      (account_id != null ? account_id.length : undefined) !== 36 ||
      (project_id != null ? project_id.length : undefined) !== 36
    ) {
      throw Error("invalid account_id or project_id");
    }
    if (
      !(this.projects[account_id] != null
        ? this.projects[account_id][project_id]
        : undefined)
    ) {
      return;
    }
    if (!no_emit) {
      this.emit(`remove_user_from_project-${account_id}`, project_id);
    }
    if (this.collabs[account_id] == null) {
      this.collabs[account_id] = {};
    }
    for (const other_account_id in this.users[project_id]) {
      this.collabs[account_id][other_account_id] -= 1;
      if (this.collabs[account_id][other_account_id] === 0) {
        delete this.collabs[account_id][other_account_id];
        if (!no_emit) {
          this.emit(`remove_collaborator-${account_id}`, other_account_id);
        }
      }
      this.collabs[other_account_id][account_id] -= 1;
      if (this.collabs[other_account_id][account_id] === 0) {
        delete this.collabs[other_account_id][account_id];
        if (!no_emit) {
          this.emit(`remove_collaborator-${other_account_id}`, account_id);
        }
      }
    }
    delete this.users[project_id][account_id];
    delete this.projects[account_id][project_id];
  }

  // Register the given account so that this client watches the database
  // in order to be aware of all projects and collaborators of the
  // given account.
  public async register(account_id: string): Promise<void> {
    await callback(this.register_cb.bind(this), account_id);
  }

  private register_cb(account_id: string, cb: Function): void {
    if (this.state == "closed") return;
    const dbg = this.dbg(`register(account_id="${account_id}"`);
    if (this.accounts[account_id] != null) {
      dbg(
        `already registered -- listener counts ${JSON.stringify(
          this.listener_counts(account_id),
        )}`,
      );
      cb();
      return;
    }
    if (len(this.register_todo) === 0) {
      // no registration is currently happening
      this.register_todo[account_id] = [cb];
      // kick things off -- this will keep registering accounts
      // until everything is done, then this.register_todo will have length 0.
      this.do_register();
    } else {
      // Accounts are being registered right now.  Add to the todo list.
      const v = this.register_todo[account_id];
      if (v != null) {
        v.push(cb);
      } else {
        this.register_todo[account_id] = [cb];
      }
    }
  }

  // Call do_register_work to completely clear the work
  // this.register_todo work queue.
  // NOTE: do_register_work does each account, *one after another*,
  // rather than doing everything in parallel.   WARNING: DO NOT
  // rewrite this to do everything in parallel, unless you think you
  // thoroughly understand the algorithm, since I think
  // doing things in parallel would horribly break!
  private async do_register(): Promise<void> {
    if (this.state != "ready") return; // maybe shutting down.

    // This gets a single account_id, if there are any:
    let account_id: string | undefined = undefined;
    for (account_id in this.register_todo) break;
    if (account_id == null) return; // nothing to do.

    const dbg = this.dbg(`do_register(account_id="${account_id}")`);
    dbg("registering account");
    if (this.do_register_lock)
      throw Error("do_register MUST NOT be called twice at once!");
    this.do_register_lock = true;
    try {
      // Register this account, which starts by getting ALL of their projects.
      // 2021-05-10: it's possible that a single user has a really large number of projects, so
      // we get the projects in batches to reduce the load on the database.
      // We must have *all* projects, since this is used frequently in
      //     database/postgres-user-queries.coffee
      // when deciding how to route listen/notify events to users.  Search for
      //   "# Check that this is a project we have read access to"
      // E.g., without all projects, changefeeds would just fail to update,
      // which, e.g., makes it so projects appear to not start.
      // Register this account
      const client = await getPoolClient();
      let projects: QueryResult[] = [];
      const batchSize = 2000;
      try {
        // Start a transaction
        await client.query("BEGIN");
        // Declare a cursor
        await client.query(
          `
   DECLARE project_cursor CURSOR FOR SELECT project_id, json_agg(o) as users
      FROM (SELECT project_id, jsonb_object_keys(users) AS o FROM projects
     WHERE users ? $1::TEXT) AS s group by s.project_id`,
          [account_id],
        );
        // Fetch rows in batches
        while (true) {
          const batchResult = await client.query(
            `FETCH ${batchSize} FROM project_cursor`,
          );
          projects = projects.concat(batchResult.rows);
          if (batchResult.rows.length < batchSize) {
            break; // No more rows to fetch
          }
        }
        // Close the cursor and end the transaction
        await client.query("CLOSE project_cursor");
        await client.query("COMMIT");
      } catch (err) {
        // If an error occurs, roll back the transaction
        await client.query("ROLLBACK");
        const e = `error registering '${account_id}' -- err=${err}`;
        dbg(e);
        this.handle_error(e); // it is game over.
        return;
      } finally {
        client.release();
      }
      // we care about this account_id
      this.accounts[account_id] = true;

      dbg("now adding all users to project tracker -- start");
      for (const project of projects) {
        if (this.users[project.project_id] != null) {
          // already have data about this project
          continue;
        } else {
          for (const collab_account_id of project.users) {
            if (collab_account_id == null) {
              continue; // just skip; evidently rarely this isn't defined, maybe due to db error?
            }
            this.add_user_to_project(collab_account_id, project.project_id);
          }
        }
      }
      dbg("successfully registered -- stop");

      // call the callbacks
      const callbacks = this.register_todo[account_id];
      if (callbacks != null) {
        for (const cb of callbacks) {
          cb();
        }
        // We are done (trying to) register account_id.
        delete this.register_todo[account_id];
      }
    } finally {
      this.do_register_lock = false;
    }
    if (len(this.register_todo) > 0) {
      // Deal with next account that needs to be registered
      this.do_register();
    }
  }

  // TODO: not actually used by any client yet... but obviously it should
  // be since this would be a work/memory leak, right?
  public unregister(account_id: string): void {
    if (this.state == "closed") return;
    if (!this.accounts[account_id]) return; // nothing to do

    const v: string[] = [];
    for (const project_id in this.projects[account_id]) {
      v.push(project_id);
    }
    delete this.accounts[account_id];

    // Forget about any projects they account_id is on that are no longer
    // necessary to watch...
    for (const project_id of v) {
      let need: boolean = false;
      for (const other_account_id in this.users[project_id]) {
        if (this.accounts[other_account_id] != null) {
          need = true;
          break;
        }
      }
      if (!need) {
        for (const other_account_id in this.users[project_id]) {
          this.remove_user_from_project(other_account_id, project_id, true);
        }
        delete this.users[project_id];
      }
    }
  }

  // Return *set* of projects that this user is a collaborator on
  public get_projects(account_id: string): { [project_id: string]: boolean } {
    if (this.state == "closed") return {};
    if (!this.accounts[account_id]) {
      // This should never happen, but very rarely it DOES.  I do not know why, having studied the
      // code.  But when it does, just raising an exception blows up the server really badly.
      // So for now we just async register the account, return that it is not a collaborator
      // on anything.  Then some query will fail, get tried again, and work since registration will
      // have finished.
      //throw Error("account (='#{account_id}') must be registered")
      this.register(account_id);
      return {};
    }
    return this.projects[account_id] != null ? this.projects[account_id] : {};
  }

  // map from collabs of account_id to number of projects they collab
  // on (account_id itself counted twice)
  public get_collabs(account_id: string): { [account_id: string]: number } {
    if (this.state == "closed") return {};
    return this.collabs[account_id] != null ? this.collabs[account_id] : {};
  }

  private listener_counts(account_id: string): object {
    const x: any = {};
    for (const e of [
      "add_user_to_project",
      "remove_user_from_project",
      "add_collaborator",
      "remove_collaborator",
    ]) {
      const event = e + "-" + account_id;
      x[event] = this.listenerCount(event);
    }
    return x;
  }
}

function all_query(db: PostgreSQL, opts: QueryOptions, cb: Function): void {
  if (opts == null) {
    throw Error("opts must not be null");
  }
  opts.cb = all_results(cb);
  db._query(opts);
}

async function query<T>(
  db: PostgreSQL,
  opts: QueryOptions,
): Promise<QueryResult<T>[]> {
  return await callback(all_query, db, opts);
}
