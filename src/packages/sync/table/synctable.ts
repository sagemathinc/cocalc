/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*

Variations:  Instead of making this class really complicated
with many different ways to do sync (e.g, changefeeds, project
websockets, unit testing, etc.), we have one single approach via
a Client that has a certain interface.  Then we implement different
Clients that have this interface, in order to support different
ways of orchestrating a SyncTable.

TODO:
 - copy over and update docs from synctable.coffee header.


*/

// CoCalc, Copyright (C) 2018, Sagemath Inc.

// If true, will log to the console a huge amount of
// info about every get/set
let DEBUG: boolean = false;

export function set_debug(x: boolean): void {
  DEBUG = x;
}

import { delay } from "awaiting";
import { global_cache_decref } from "./global-cache";
import { EventEmitter } from "events";
import { Map, fromJS, List } from "immutable";
import { keys, throttle } from "lodash";
import { callback2, cancel_scheduled, once } from "@cocalc/util/async-utils";
import { wait } from "@cocalc/util/async-wait";
import { query_function } from "./query-function";
import { assert_uuid, copy, is_array, is_object, len } from "@cocalc/util/misc";
import * as schema from "@cocalc/util/schema";

export type Query = any; // todo
export type QueryOptions = any[]; // todo

// What we need the client below to implement so we can use
// it to support a table.
export interface Client extends EventEmitter {
  is_project: () => boolean;
  dbg: (str: string) => Function;
  query: Function;
  query_cancel: Function;
  server_time: Function;
  alert_message?: Function;
  is_connected: () => boolean;
  is_signed_in: () => boolean;
  touch_project: (opts: any) => void;
  set_connected?: Function;
}

export interface VersionedChange {
  obj: { [key: string]: any };
  version: number;
}

export interface TimedChange {
  obj: { [key: string]: any };
  time: number; // ms since epoch
}

function is_fatal(err: string): boolean {
  return err.indexOf("FATAL") != -1;
}

import { reuseInFlight } from "async-await-utils/hof";

import { Changefeed } from "./changefeed";
import { parse_query, to_key } from "./util";

export type State = "disconnected" | "connected" | "closed";

export class SyncTable extends EventEmitter {
  private changefeed?: Changefeed;
  private query: Query;
  private client_query: any;
  private primary_keys: string[];
  private options: QueryOptions;
  public readonly client: Client;
  private throttle_changes?: number;
  private throttled_emit_changes?: Function;
  private last_server_time: number = 0;
  private error: { error: string; query: Query } | undefined = undefined;

  // Immutable map -- the value of this synctable.
  private value?: Map<string, Map<string, any>>;
  private last_save: Map<string, Map<string, any>> = Map();

  // Which records we have changed (and when, by server time),
  // that haven't been sent to the backend.
  private changes: { [key: string]: number } = {};

  // The version of each record.
  private versions: { [key: string]: number } = {};

  // The inital version is only used in the project, where we
  // just assume the clock is right.  If this were totally
  // off/changed, then clients would get confused -- until they
  // close and open the file or refresh their browser.  It might
  // be better to switch to storing the current version number
  // on disk.
  private initial_version: number = new Date().valueOf();

  // disconnected <--> connected --> closed
  private state: State;
  public table: string;
  private schema: any;
  private emit_change: Function;
  public reference_count: number = 0;
  public cache_key: string | undefined;
  // Which fields the user is allowed to set/change.
  // Gets updated during init.
  private set_fields: string[] = [];
  // Which fields *must* be included in any set query.
  // Also updated during init.
  private required_set_fields: { [key: string]: boolean } = {};

  // Coerce types and generally do strong checking of all
  // types using the schema.  Do this unless you have a very
  // good reason not to!
  private coerce_types: boolean = true;

  // If set, then the table is assumed to be managed
  // entirely externally (using events).
  // This is used by the synctables that are managed
  // entirely by the project (e.g., sync-doc support).
  private no_db_set: boolean = false;

  // Set only for some tables.
  private project_id?: string;

  private last_has_uncommitted_changes?: boolean = undefined;

  constructor(
    query,
    options: any[],
    client: Client,
    throttle_changes?: number,
    coerce_types?: boolean,
    no_db_set?: boolean,
    project_id?: string
  ) {
    super();

    if (coerce_types != undefined) {
      this.coerce_types = coerce_types;
    }
    if (no_db_set != undefined) {
      this.no_db_set = no_db_set;
    }
    if (project_id != undefined) {
      this.project_id = project_id;
    }

    if (is_array(query)) {
      throw Error("must be a single query, not array of queries");
    }

    this.set_state("disconnected");

    this.changefeed_on_update = this.changefeed_on_update.bind(this);
    this.changefeed_on_close = this.changefeed_on_close.bind(this);

    this.setMaxListeners(100);
    this.query = parse_query(query);
    this.options = options;
    this.client = client;
    this.throttle_changes = throttle_changes;

    this.init_query();
    this.init_throttle_changes();

    // So only ever runs once at a time.
    this.save = reuseInFlight(this.save.bind(this));
    this.first_connect();
  }

  /* PUBLIC API */

  // is_ready is true if the table has been initialized and not yet closed.
  // It might *not* be currently connected, due to a temporary network
  // disconnect.   When is_ready is true you can read and write to this table,
  // but there is no guarantee things aren't temporarily stale.
  public is_ready(): boolean {
    return this.value != null && this.state !== "closed";
  }

  /*
  Return true if there are changes to this synctable that
  have NOT been confirmed as saved to the backend database.
  (Always returns false when not yet initialized.)
  */
  public has_uncommitted_changes(): boolean {
    if (this.state === "closed") {
      return false; // if closed, can't have any uncommitted changes.
    }
    return len(this.changes) !== 0;
  }

  /* Gets records from this table.
       - arg = not given: returns everything (as an
               immutable map from key to obj)
       - arg = array of keys; return map from key to obj
       - arg = single key; returns corresponding object

    This is NOT a generic query mechanism.  SyncTable
    is really best thought of as a key:value store!
  */
  public get(arg?): Map<string, any> | undefined {
    this.assert_not_closed("get");

    if (this.value == null) {
      throw Error("table not yet initialized");
    }

    if (arg == null) {
      return this.value;
    }

    if (is_array(arg)) {
      let x: Map<string, Map<string, any>> = Map();
      for (const k of arg) {
        const key: string | undefined = to_key(k);
        if (key != null) {
          const y = this.value.get(key);
          if (y != null) {
            x = x.set(key, y);
          }
        }
      }
      return x;
    } else {
      const key = to_key(arg);
      if (key != null) {
        return this.value.get(key);
      }
    }
  }

  /* Return the number of records in the table. */
  public size(): number {
    this.assert_not_closed("size");
    if (this.value == null) {
      throw Error("table not yet initialized");
    }
    return this.value.size;
  }

  /*
  Get one record from this table.  Especially useful when
  there is only one record, which is an important special
  case (a so-called "wide" table?.)
  */
  public get_one(arg?): Map<string, any> | undefined {
    if (this.value == null) {
      throw Error("table not yet initialized");
    }

    if (arg == null) {
      return this.value.toSeq().first();
    } else {
      // get only returns (at most) one object, so it's "get_one".
      return this.get(arg);
    }
  }

  private async wait_until_value(): Promise<void> {
    if (this.value != null) return;
    // can't save until server sends state.  We wait.
    await once(this, "init-value-server");
    if (this.value == null) {
      throw Error("bug -- change should initialize value");
    }
  }

  /*
  Ensure any unsent changes are sent to the backend.
  When this function returns there are no unsent changes,
  since it keeps calling _save until nothing has changed
  locally.
  */
  public async save(): Promise<void> {
    //console.log("synctable SAVE");
    this.assert_not_closed("save");
    if (this.value == null) {
      // nothing to save yet
      return;
    }

    while (this.has_uncommitted_changes()) {
      if (this.error) {
        // do not try to save when there's an error since that
        // won't help.  Need to attempt to fix it first.
        console.warn("WARNING -- not saving ", this.error);
        return;
      }
      //console.log("SAVE -- has uncommitted changes, so trying again.");
      if (this.state !== "connected") {
        // wait for state change.
        // This could take a long time, and that is fine.
        await once(this, "state");
      }
      if (this.state === "connected") {
        if (!(await this._save())) {
          this.update_has_uncommitted_changes();
          return;
        }
      }
      // else switched to something else (?), so
      // loop around and wait again for a change...
    }
  }

  private update_has_uncommitted_changes(): void {
    const cur = this.has_uncommitted_changes();
    if (cur !== this.last_has_uncommitted_changes) {
      this.emit("has-uncommitted-changes", cur);
      this.last_has_uncommitted_changes = cur;
    }
  }

  /*
  set -- Changes (or creates) one entry in the table.
  The input field changes is either an Immutable.js Map or a JS Object map.
  If changes does not have the primary key then a random record is updated,
  and there *must* be at least one record.  Exception: computed primary
  keys will be computed (see stuff about computed primary keys above).
  The second parameter 'merge' can be one of three values:
    'deep'   : (DEFAULT) deep merges the changes into the record, keep as much info as possible.
    'shallow': shallow merges, replacing keys by corresponding values
    'none'   : do no merging at all -- just replace record completely
  Raises an exception if something goes wrong doing the set.
  Returns updated value otherwise.

  DOES NOT causes a save.

  NOTE: we always use db schema to ensure types are correct,
  converting if necessary.   This has a performance impact,
  but is worth it for sanity's sake!!!
  */
  public set(
    changes: any,
    merge: "deep" | "shallow" | "none" = "deep",
    fire_change_event: boolean = true
  ): any {
    if (this.value == null) {
      throw Error("can't set until table is initialized");
    }

    if (!Map.isMap(changes)) {
      changes = fromJS(changes);
      if (!is_object(changes)) {
        throw Error(
          "type error -- changes must be an immutable.js Map or JS map"
        );
      }
    }
    if (DEBUG) {
      //console.log(`set('${this.table}'): ${JSON.stringify(changes.toJS())}`);
    }

    // For sanity!
    changes = this.do_coerce_types(changes);
    // Ensure that each key is allowed to be set.
    if (this.client_query.set == null) {
      throw Error(`users may not set ${this.table}`);
    }

    const can_set = this.client_query.set.fields;
    changes.map((_, k) => {
      if (can_set[k] === undefined) {
        throw Error(`users may not set ${this.table}.${k}`);
      }
    });
    // Determine the primary key's value
    let key: string | undefined = this.obj_to_key(changes);
    if (key == null) {
      // attempt to compute primary key if it is a computed primary key
      let key0 = this.computed_primary_key(changes);
      key = to_key(key0);
      if (key == null && this.primary_keys.length === 1) {
        // use a "random" primary key from existing data
        key0 = key = this.value.keySeq().first();
      }
      if (key == null) {
        throw Error(
          `must specify primary key ${this.primary_keys.join(
            ","
          )}, have at least one record, or have a computed primary key`
        );
      }
      // Now key is defined
      if (this.primary_keys.length === 1) {
        changes = changes.set(this.primary_keys[0], key0);
      } else if (this.primary_keys.length > 1) {
        if (key0 == null) {
          // to satisfy typescript.
          throw Error("bug -- computed primary key must be an array");
        }
        let i = 0;
        for (const pk of this.primary_keys) {
          changes = changes.set(pk, key0[i]);
          i += 1;
        }
      }
    }

    // Get the current value
    const cur = this.value.get(key);
    let new_val;

    if (cur == null) {
      // No record with the given primary key.  Require that
      // all the this.required_set_fields are specified, or
      // it will become impossible to sync this table to
      // the backend.
      for (const k in this.required_set_fields) {
        if (changes.get(k) == null) {
          throw Error(`must specify field '${k}' for new records`);
        }
      }
      // If no current value, then next value is easy -- it equals the current value in all cases.
      new_val = changes;
    } else {
      // Use the appropriate merge strategy to get the next val.
      // Fortunately, these are all built into immutable.js!
      switch (merge) {
        case "deep":
          new_val = cur.mergeDeep(changes);
          break;
        case "shallow":
          new_val = cur.merge(changes);
          break;
        case "none":
          new_val = changes;
          break;
        default:
          throw Error("merge must be one of 'deep', 'shallow', 'none'");
      }
    }

    if (new_val.equals(cur)) {
      // nothing actually changed, so nothing further to do.
      return new_val;
    }

    // clear error state -- the change may be just what is needed
    // to fix the error, e.g., attempting to save an invalid account
    // setting, then fixing it.
    this.clearError();

    for (const field in this.required_set_fields) {
      if (!new_val.has(field)) {
        throw Error(
          `missing required set field ${field} of table ${this.table}`
        );
      }
    }

    // Something changed:
    this.value = this.value.set(key, new_val);
    this.changes[key] = this.unique_server_time();
    this.update_has_uncommitted_changes();
    if (this.client.is_project()) {
      // project assigns versions
      const version = this.increment_version(key);
      const obj = new_val.toJS();
      this.emit("versioned-changes", [{ obj, version }]);
    } else {
      // browser gets them assigned...
      this.null_version(key);
      // also touch to indicate activity and make sure project running,
      // in some cases.
      this.touch_project();
    }
    if (fire_change_event) {
      this.emit_change([key]);
    }

    return new_val;
  }

  private async touch_project(): Promise<void> {
    if (this.project_id != null) {
      try {
        await this.client.touch_project(this.project_id);
      } catch (err) {
        // not fatal
        console.warn("touch_project -- ", this.project_id, err);
      }
    }
  }

  public close_no_async(): void {
    if (this.state === "closed") {
      // already closed
      return;
    }
    // decrement the reference to this synctable
    if (global_cache_decref(this)) {
      // close: not zero -- so don't close it yet --
      // still in use by possibly multiple clients
      return;
    }

    if (this.throttled_emit_changes != null) {
      cancel_scheduled(this.throttled_emit_changes);
      delete this.throttled_emit_changes;
    }

    this.client.removeListener("disconnected", this.disconnected);
    this.close_changefeed();
    this.set_state("closed");
    this.removeAllListeners();
    delete this.value;
  }

  public async close(fatal: boolean = false): Promise<void> {
    if (this.state === "closed") {
      // already closed
      return;
    }
    if (!fatal) {
      // do a last attempt at a save (so we don't lose data),
      // then really close.
      await this.save(); // attempt last save to database.
      /*
      The moment the sync part of _save is done, we remove listeners
      and clear everything up.  It's critical that as soon as close
      is called that there be no possible way any further connect
      events (etc) can make this SyncTable
      do anything!!  That finality assumption is made
      elsewhere (e.g in @cocalc/project).
      */
    }
    this.close_no_async();
  }

  public async wait(until: Function, timeout: number = 30): Promise<any> {
    this.assert_not_closed("wait");

    return await wait({
      obj: this,
      until,
      timeout,
      change_event: "change-no-throttle",
    });
  }

  /* INTERNAL PRIVATE METHODS */

  private async first_connect(): Promise<void> {
    try {
      await this.connect();
      this.update_has_uncommitted_changes();
    } catch (err) {
      console.warn(
        `synctable: failed to connect (table=${this.table}), error=${err}`,
        this.query
      );
      this.close(true);
    }
  }

  private set_state(state: State): void {
    this.state = state;
    this.emit(state);
  }

  public get_state(): State {
    return this.state;
  }

  public get_table(): string {
    return this.table;
  }

  private set_throttle_changes(): void {
    // No throttling of change events, unless explicitly requested
    // *or* part of the schema.
    if (this.throttle_changes != null) return;
    const t = schema.SCHEMA[this.table];
    if (t == null) return;
    const u = t.user_query;
    if (u == null) return;
    const g = u.get;
    if (g == null) return;
    this.throttle_changes = g.throttle_changes;
  }

  private init_throttle_changes(): void {
    this.set_throttle_changes();

    if (!this.throttle_changes) {
      this.emit_change = (changed_keys: string[]) => {
        this.emit("change", changed_keys);
        this.emit("change-no-throttle", changed_keys);
      };
      return;
    }

    // throttle emitting of change events
    let all_changed_keys = {};
    const do_emit_changes = () => {
      //console.log("#{this.table} -- emitting changes", keys(all_changed_keys))
      // CRITICAL: some code depends on emitting change even
      // for the *empty* list of keys!
      // E.g., projects page won't load for new users.  This
      // is the *change* from not loaded to being loaded,
      // which does make sense.
      this.emit("change", keys(all_changed_keys));
      all_changed_keys = {};
    };
    this.throttled_emit_changes = throttle(
      do_emit_changes,
      this.throttle_changes
    );
    this.emit_change = (changed_keys) => {
      //console.log("emit_change", changed_keys);
      this.dbg("emit_change")(changed_keys);
      //console.log("#{this.table} -- queue changes", changed_keys)
      for (const key of changed_keys) {
        all_changed_keys[key] = true;
      }
      this.emit("change-no-throttle", changed_keys);
      if (this.throttled_emit_changes != null) {
        this.throttled_emit_changes();
      }
    };
  }

  private dbg(_f?: string): Function {
    if (!DEBUG) {
      return () => {};
    }
    if (this.client.is_project()) {
      return this.client.dbg(
        `SyncTable('${JSON.stringify(this.query)}').${_f}`
      );
    } else {
      return (...args) => {
        console.log(`synctable("${this.table}").${_f}: `, ...args);
      };
    }
  }

  private async connect(): Promise<void> {
    const dbg = this.dbg("connect");
    dbg();
    this.assert_not_closed("connect");
    if (this.state === "connected") {
      return;
    }

    // 1. save, in case we have any local unsaved changes,
    // then sync with upstream.
    if (this.value != null) {
      dbg("send off any local unsaved changes first");
      await this.save();
    }

    // 2. Now actually setup the changefeed.
    // (Even if this.no_db_set is set, this still may do
    // an initial query to the database.  However, the changefeed
    // does nothing further.)
    dbg("actually setup changefeed");
    await this.create_changefeed();

    dbg("connect should have succeeded");
  }

  private async create_changefeed(): Promise<void> {
    const dbg = this.dbg("create_changefeed");
    if (this.get_state() == "closed") {
      dbg("closed so don't do anything ever again");
      return;
    }
    dbg("creating changefeed connection...");
    let initval;
    try {
      initval = await this.create_changefeed_connection();
    } catch (err) {
      dbg("failed to create changefeed", err.toString());
      // Typically this happens if synctable closed while
      // creating the connection...
      this.close();
      throw err;
    }
    if (this.state == "closed") {
      return;
    }
    dbg("got changefeed, now initializing table data");
    this.init_changefeed_handlers();
    const changed_keys = this.update_all(initval);
    dbg("setting state to connected");
    this.set_state("connected");

    // NOTE: Can't emit change event until after
    // switching state to connected, which is why
    // we do it here.
    this.emit_change(changed_keys);
  }

  private close_changefeed(): void {
    if (this.changefeed == null) return;
    this.remove_changefeed_handlers();
    this.changefeed.close();
    delete this.changefeed;
  }

  private async create_changefeed_connection(): Promise<any[]> {
    let delay_ms: number = 500;
    while (true) {
      this.close_changefeed();
      this.changefeed = new Changefeed(this.changefeed_options());
      await this.wait_until_ready_to_query_db();
      try {
        return await this.changefeed.connect();
      } catch (err) {
        if (is_fatal(err.toString())) {
          console.warn("FATAL creating initial changefeed", this.table, err);
          this.close(true);
          throw err;
        }
        // This can happen because we might suddenly NOT be ready
        // to query db immediately after we are ready...
        console.warn(
          `${this.table} -- failed to connect -- ${err}; will retry`
        );
        await delay(delay_ms);
        if (delay_ms < 8000) {
          delay_ms *= 1.3;
        }
      }
    }
  }

  private async wait_until_ready_to_query_db(): Promise<void> {
    const dbg = this.dbg("wait_until_ready_to_query_db");

    // Wait until we're ready to query the database.
    let client_state: string;

    if (this.schema.anonymous || this.client.is_project()) {
      // For anonymous tables (and for project accessing db),
      // this just means the client is connected.
      client_state = "connected";
    } else {
      // For non-anonymous tables, the client
      // has to actually be signed in.
      client_state = "signed_in";
    }

    if (this.client[`is_${client_state}`]()) {
      dbg("state already achieved -- no need to wait");
      return;
    }

    await once(this.client, client_state);
    dbg(`success -- client emited ${client_state}`);
  }

  private changefeed_options() {
    return {
      do_query: query_function(this.client.query, this.table),
      query_cancel: this.client.query_cancel.bind(this.client),
      options: this.options,
      query: this.query,
      table: this.table,
    };
  }

  private init_changefeed_handlers(): void {
    if (this.changefeed == null) return;
    this.changefeed.on("update", this.changefeed_on_update);
    this.changefeed.on("close", this.changefeed_on_close);
  }

  private remove_changefeed_handlers(): void {
    if (this.changefeed == null) return;
    this.changefeed.removeListener("update", this.changefeed_on_update);
    this.changefeed.removeListener("close", this.changefeed_on_close);
  }

  private changefeed_on_update(change): void {
    this.update_change(change);
  }

  private changefeed_on_close(): void {
    this.set_state("disconnected");
    this.create_changefeed();
  }

  private disconnected(why: string): void {
    const dbg = this.dbg("disconnected");
    dbg(`why=${why}`);
    if (this.state === "disconnected") {
      dbg("already disconnected");
      return;
    }
    this.set_state("disconnected");
  }

  private obj_to_key(_): string | undefined {
    // Return string key used in the immutable map in
    // which this table is stored.
    throw Error("this.obj_to_key must be set during initialization");
  }

  private init_query(): void {
    // Check that the query is probably valid, and
    // record the table and schema
    const tables = keys(this.query);
    if (len(tables) !== 1) {
      throw Error("must query only a single table");
    }
    this.table = tables[0];
    this.schema = schema.SCHEMA[this.table];
    if (this.schema == null) {
      throw Error(`unknown schema for table ${this.table}`);
    }
    if (this.client.is_project()) {
      this.client_query = this.schema.project_query;
    } else {
      this.client_query = this.schema.user_query;
    }
    if (this.client_query == null) {
      throw Error(`no query schema allowing queries to ${this.table}`);
    }
    if (!is_array(this.query[this.table])) {
      throw Error("must be a multi-document query");
    }
    this.primary_keys = schema.client_db.primary_keys(this.table);
    // Check that all primary keys are in the query.
    for (const primary_key of this.primary_keys) {
      if (this.query[this.table][0][primary_key] === undefined) {
        throw Error(
          `must include each primary key in query of table '${this.table}', but you missed '${primary_key}'`
        );
      }
    }
    // Check that all keys in the query are allowed by the schema.
    for (const query_key of keys(this.query[this.table][0])) {
      if (this.client_query.get.fields[query_key] === undefined) {
        throw Error(
          `every key in query of table '${this.table}' must` +
            ` be a valid user get field in the schema but '${query_key}' is not`
        );
      }
    }

    // Function this.to_key to extract primary key from object
    if (this.primary_keys.length === 1) {
      // very common case
      const pk = this.primary_keys[0];
      this.obj_to_key = (obj) => {
        if (obj == null) {
          return;
        }
        if (Map.isMap(obj)) {
          return to_key(obj.get(pk));
        } else {
          return to_key(obj[pk]);
        }
      };
    } else {
      // compound primary key
      this.obj_to_key = (obj) => {
        if (obj == null) {
          return;
        }
        const v: string[] = [];
        if (Map.isMap(obj)) {
          for (const pk of this.primary_keys) {
            const a = obj.get(pk);
            if (a == null) {
              return;
            }
            v.push(a);
          }
        } else {
          for (const pk of this.primary_keys) {
            const a = obj[pk];
            if (a == null) {
              return;
            }
            v.push(a);
          }
        }
        return to_key(v);
      };
    }

    if (this.client_query != null && this.client_query.set != null) {
      // Initialize set_fields and required_set_fields.
      const set = this.client_query.set;
      for (const field of keys(this.query[this.table][0])) {
        if (set.fields != null && set.fields[field]) {
          this.set_fields.push(field);
        }
        if (set.required_fields != null && set.required_fields[field]) {
          this.required_set_fields[field] = true;
        }
      }
    }
  }

  /* Send all unsent changes.
     This function must not be called more than once at a time.
     Returns boolean:
        false -- there are no additional changes to be saved
        true -- new changes may have appeared during the _save that
                need to be saved.

     If writing to the database results in an error (but not due to no network),
     then an error state is set (which client can consult), an even is emitted,
     and we do not try to write to the database again until that error
     state is cleared. One way it can be cleared is by changing the table.
  */
  private async _save(): Promise<boolean> {
    //console.log("_save");
    const dbg = this.dbg("_save");
    dbg();
    if (this.get_state() == "closed") return false;
    if (this.client_query.set == null) {
      // Nothing to do -- can never set anything for this table.
      // There are some tables (e.g., stats) where the remote values
      // could change while user is offline, and the code below would
      // result in warnings.
      return false;
    }
    //console.log("_save", this.table);
    dbg("waiting for network");
    await this.wait_until_ready_to_query_db();
    if (this.get_state() == "closed") return false;
    dbg("waiting for value");
    await this.wait_until_value();
    if (this.get_state() == "closed") return false;
    if (len(this.changes) === 0) return false;
    if (this.value == null) {
      throw Error("value must not be null");
    }

    // Send our changes to the server.
    const query: any[] = [];
    const timed_changes: TimedChange[] = [];
    const proposed_keys: { [key: string]: boolean } = {};
    const changes = copy(this.changes);
    //console.log("_save: send ", changes);
    for (const key in this.changes) {
      if (this.versions[key] === 0) {
        proposed_keys[key] = true;
      }
      const x = this.value.get(key);
      if (x == null) {
        throw Error("delete is not implemented");
      }
      const obj = x.toJS();

      if (!this.no_db_set) {
        // qobj is the db query version of obj, or at least the part
        // of it that expresses what changed.
        const qobj = {};
        // Set the primary key part:
        if (this.primary_keys.length === 1) {
          qobj[this.primary_keys[0]] = key;
        } else {
          // unwrap compound primary key
          const v = JSON.parse(key);
          let i = 0;
          for (const primary_key of this.primary_keys) {
            qobj[primary_key] = v[i];
            i += 1;
          }
        }
        // Can only send set_field sets to the database.  Of these,
        // only send what actually changed.
        const prev = this.last_save.get(key);
        for (const k of this.set_fields) {
          if (!x.has(k)) continue;
          if (prev == null) {
            qobj[k] = obj[k];
            continue;
          }

          // Convert to List to get a clean way to *compare* no
          // matter whether they are immutable.js objects or not!
          const a = List([x.get(k)]);
          const b = List([prev.get(k)]);
          if (!a.equals(b)) {
            qobj[k] = obj[k];
          }
        }

        for (const k in this.required_set_fields) {
          if (qobj[k] == null) {
            qobj[k] = obj[k];
          }
        }

        query.push({ [this.table]: qobj });
      }
      timed_changes.push({ obj, time: this.changes[key] });
    }
    dbg("sending timed-changes", timed_changes);
    this.emit("timed-changes", timed_changes);

    if (!this.no_db_set) {
      try {
        const value = this.value;
        dbg("doing database query");
        await callback2(this.client.query, {
          query,
          options: [{ set: true }], // force it to be a set query
          timeout: 120, // give it some time (especially if it is long)
        });
        this.last_save = value; // success -- don't have to save this stuff anymore...
      } catch (err) {
        this.setError(err, query);
        dbg("db query failed", err);
        if (is_fatal(err.toString())) {
          console.warn("FATAL doing set", this.table, err);
          this.close(true);
          throw err;
        }
        // NOTE: we do not show entire log since the number
        // of entries in the query can be very large and just
        // converting them all to text could use a lot of memory (?).
        console.warn(
          `_save('${this.table}') set query error:`,
          err,
          " queries: ",
          query[0],
          "...",
          query.length - 1,
          " omitted"
        );
        return true;
      }
    }

    if (this.get_state() == "closed") return false;
    if (this.value == null) {
      // should not happen
      return false;
    }

    if (this.no_db_set) {
      // Not using changefeeds, so have to depend on other mechanisms
      // to update state.  Wait until changes to proposed keys are
      // acknowledged by their version being assigned.
      try {
        dbg("waiting until versions are updated");
        await this.wait_until_versions_are_updated(proposed_keys, 5000);
      } catch (err) {
        dbg("waiting for versions timed out / failed");
        // took too long -- try again to send and receive changes.
        return true;
      }
    }

    dbg("Record that we successfully sent these changes");
    for (const key in changes) {
      if (changes[key] == this.changes[key]) {
        delete this.changes[key];
      }
    }
    this.update_has_uncommitted_changes();

    const is_done = len(this.changes) === 0;
    dbg("done? ", is_done);
    return !is_done;
  }

  private setError(error: string, query: Query): void {
    this.error = { error, query };
    this.emit("error", this.error);
  }

  public clearError(): void {
    this.error = undefined;
    this.emit("clear-error");
  }

  private async wait_until_versions_are_updated(
    proposed_keys: { [key: string]: boolean },
    timeout_ms: number
  ): Promise<void> {
    const start_ms = new Date().valueOf();
    while (len(proposed_keys) > 0) {
      for (const key in proposed_keys) {
        if (this.versions[key] > 0) {
          delete proposed_keys[key];
        }
      }
      if (len(proposed_keys) > 0) {
        const elapsed_ms = new Date().valueOf() - start_ms;
        const keys: string[] = await once(
          this,
          "increased-versions",
          timeout_ms - elapsed_ms
        );
        for (const key of keys) {
          delete proposed_keys[key];
        }
      }
    }
  }

  // Return modified immutable Map, with all types coerced to be
  // as specified in the schema, if possible, or throw an exception.
  private do_coerce_types(changes: Map<string, any>): Map<string, any> {
    if (!this.coerce_types) {
      // no-op if coerce_types isn't set.
      return changes;
    }
    const t = schema.SCHEMA[this.table];
    if (t == null) {
      throw Error(`Missing schema for table ${this.table}`);
    }
    const fields = copy(t.fields);
    if (fields == null) {
      throw Error(`Missing fields part of schema for table ${this.table}`);
    }
    let specs;
    if (t.virtual != null) {
      if (t.virtual === true) {
        throw Error(`t.virtual can't be true for ${this.table}`);
      }
      const x = schema.SCHEMA[t.virtual];
      if (x == null) {
        throw Error(`invalid virtual table spec for ${this.table}`);
      }
      specs = copy(x.fields);
      if (specs == null) {
        throw Error(`invalid virtual table spec for ${this.table}`);
      }
    } else {
      specs = fields;
    }

    if (typeof this.query != "string") {
      // explicit query (not just from schema)
      let x = this.query[this.table];
      if (is_array(x)) {
        x = x[0];
      }
      for (const k in fields) {
        if (x[k] === undefined) {
          delete fields[k];
        }
      }
    }
    return Map(
      changes.map((value, field) => {
        if (typeof field !== "string") {
          // satisfy typescript.
          return;
        }
        if (value == null) {
          // do not coerce null types
          return value;
        }
        if (fields[field] == null) {
          //console.warn(changes, fields);
          throw Error(
            `Cannot coerce: no field '${field}' in table ${this.table}`
          );
        }
        const spec = specs[field];
        let desired: string | undefined = spec.type || spec.pg_type;
        if (desired == null) {
          throw Error(`Cannot coerce: no type info for field ${field}`);
        }
        desired = desired.toLowerCase();

        const actual = typeof value;
        if (desired === actual) {
          return value;
        }

        // We can add more or less later...
        if (desired === "string" || desired.slice(0, 4) === "char") {
          if (actual !== "string") {
            // ensure is a string
            return `${value}`;
          }
          return value;
        }
        if (desired === "timestamp") {
          if (!(value instanceof Date)) {
            // make it a Date object. (usually converting from string rep)
            return new Date(value);
          }
          return value;
        }
        if (desired === "integer") {
          // always fine to do this -- will round floats, fix strings, etc.
          return parseInt(value);
        }
        if (desired === "number") {
          // actual wasn't number, so parse:
          return parseFloat(value);
        }
        if (desired === "array") {
          if (!List.isList(value)) {
            value = fromJS(value);
            if (!List.isList(value)) {
              throw Error(
                `field ${field} of table ${this.table} (value=${changes.get(
                  field
                )}) must convert to an immutable.js List`
              );
            }
          }
          return value;
        }
        if (desired === "map") {
          if (!Map.isMap(value)) {
            value = fromJS(value);
            if (!Map.isMap(value)) {
              throw Error(
                `field ${field} of table ${this.table} (value=${changes.get(
                  field
                )}) must convert to an immutable.js Map`
              );
            }
          }
          return value;
        }
        if (desired === "boolean") {
          // actual wasn't boolean, so coerce.
          return !!value;
        }
        if (desired === "uuid") {
          assert_uuid(value);
          return value;
        }
        return value;
      })
    );
  }

  /*
  Handle an update of all records from the database.
  This happens on initialization, and also if we
  disconnect and reconnect.
  */
  private update_all(v: any[]): any[] {
    //const dbg = this.dbg("update_all");

    if (this.state === "closed") {
      // nothing to do -- just ignore updates from db
      throw Error("makes no sense to do update_all when state is closed.");
    }

    this.emit("before-change");
    // Restructure the array of records in v as a mapping
    // from the primary key to the corresponding record.
    const x = {};
    for (const y of v) {
      const key = this.obj_to_key(y);
      if (key != null) {
        x[key] = y;
        // initialize all version numbers
        this.versions[key] = this.initial_version;
      }
    }
    const changed_keys = keys(x); // of course all keys have been changed.
    this.emit("increased-versions", changed_keys);

    this.value = fromJS(x);
    if (this.value == null) {
      throw Error("bug");
    }
    this.last_save = this.value;
    if (this.coerce_types) {
      // Ensure all values are properly coerced, as specified
      // in the database schema.  This is important, e.g., since
      // when mocking the client db query, JSON is involved and
      // timestamps are not parsed to Date objects.
      this.value = <Map<string, Map<string, any>>>this.value.map((val, _) => {
        if (val == null) {
          throw Error("val must not be null");
        }
        return this.do_coerce_types(val);
      });
    }

    // It's possibly that nothing changed (e.g., typical case
    // on reconnect!) so we check.
    // If something really did change, we set the server
    // state to what we just got, and
    // also inform listeners of which records changed (by giving keys).
    //console.log("update_all: changed_keys=", changed_keys)
    if (this.state === "connected") {
      // When not yet connected, initial change is emitted
      // by function that sets up the changefeed.  We are
      // connected here, so we are responsible for emitting
      // this change.
      this.emit_change(changed_keys);
    }

    this.emit("init-value-server");
    return changed_keys;
  }

  public initial_version_for_browser_client(): VersionedChange[] {
    if (this.value == null) {
      throw Error("value must not be null");
    }
    const x: VersionedChange[] = [];
    this.value.forEach((val, key) => {
      if (val == null) {
        throw Error("val must be non-null");
      }
      const obj = val.toJS();
      if (obj == null) {
        throw Error("obj must be non-null");
      }
      if (key == null) {
        throw Error("key must not be null");
      }
      const version = this.versions[key];
      if (version == null) {
        throw Error("version must not be null");
      }

      x.push({ obj, version });
    });
    return x;
  }

  public init_browser_client(changes: VersionedChange[]): void {
    const dbg = this.dbg("init_browser_client");
    dbg(`applying ${changes.length} versioned changes`);
    // The value before doing init (which happens precisely when project
    // synctable is reset). See note below.
    const before = this.value;
    const received_keys = this.apply_changes_to_browser_client(changes);
    if (before != null) {
      before.forEach((_, key) => {
        if (key == null || received_keys[key]) return; // received as part of init
        if (this.changes[key] && this.versions[key] == 0) return; // not event sent yet
        // This key was known and confirmed sent before init, but
        // didn't get sent back this time.  So it was lost somehow,
        // e.g., due to not getting saved to the database and the project
        // (or table in the project) getting restarted.
        dbg(`found lost: key=${key}`);
        // So we will try to send out it again.
        if (!this.changes[key]) {
          this.changes[key] = this.unique_server_time();
          this.update_has_uncommitted_changes();
        }
        // So we don't view it as having any known version
        // assigned by project, since the project lost it.
        this.null_version(key);
      });
      if (len(this.changes) > 0) {
        this.save(); // kick off a save of our unsaved lost work back to the project.
      }
    }
    /*
    NOTE: The problem solved here is the following.  Imagine the project
    synctable is killed, and it has acknowledge a change C from a
    web browser client, but has NOT saved that change to the central
    postgreSQL database (or someday, maybe a local SQLite database).
    Then when the project synctable is resurrected, it uses the database
    for its initial state, and it knows nothing about C.  The
    browser thinks that C has been successfully written and broadcast
    to everybody, so the browser doesn't send C again.  The result is
    that the browser and the project would be forever out of sync.
    Note that we only care about lost changes that some browser knows
    about -- if no browser knows about them, then the fact they are
    lost won't break sync.  Also, for file editing, data is regularly
    saved to disk, so if the browser sends a change that is lost due to
    the project being killed before writing to the database, then the
    browser terminates too, then that change is completely lost.  However,
    everybody will start again with at least the last version of the file
    **saved to disk,** which is basically what people may expect as a
    worst case.

    The solution to the above problem is to look at what key:value pairs
    we know about that the project didn't just send back to us.  If there
    are any that were reported as committed, but they vanished, then we
    set them as unsent and send them again.
    */
  }

  public apply_changes_to_browser_client(changes: VersionedChange[]): {
    [key: string]: boolean;
  } {
    const dbg = this.dbg("apply_changes_to_browser_client");
    dbg("got ", changes.length, "changes");
    this.assert_not_closed("apply_changes_to_browser_client");
    if (this.value == null) {
      // initializing the synctable for the first time.
      this.value = Map();
    }

    this.emit("before-change");
    const changed_keys: string[] = [];
    const increased_versions: string[] = [];
    const received_keys: { [key: string]: boolean } = {};
    for (const change of changes) {
      const { obj, version } = change;
      const new_val = this.do_coerce_types(fromJS(obj));
      const key = this.obj_to_key(new_val);
      if (key == null) {
        throw Error("object results in null key");
      }
      received_keys[key] = true;
      const cur_version = this.versions[key] ? this.versions[key] : 0;
      if (cur_version > version) {
        // nothing further to do.
        continue;
      }
      if (this.handle_new_val(new_val, undefined, "insert", false)) {
        // really did make a change.
        changed_keys.push(key);
      }
      // Update our version number to the newer version.
      this.versions[key] = version;
      increased_versions.push(key);
    }

    if (increased_versions.length > 0) {
      this.emit("increased-versions", increased_versions);
    }

    if (changed_keys.length > 0) {
      this.emit_change(changed_keys);
    }
    return received_keys;
  }

  public apply_changes_from_browser_client(changes: TimedChange[]): void {
    const dbg = this.dbg("apply_changes_from_browser_client");
    dbg("project <-- changes -- client", JSON.stringify(changes));
    const changed_keys: string[] = [];
    const versioned_changes: VersionedChange[] = [];
    for (const change of changes) {
      const { obj, time } = change;
      if (obj == null) {
        throw Error("obj must not be null");
      }
      const new_val = this.do_coerce_types(fromJS(obj));
      const key = this.obj_to_key(new_val); // must have been coerced!
      if (key == null) {
        throw Error("object results in null key");
      }
      const cur_time = this.changes[key];
      if (cur_time != null && cur_time > time) {
        dbg("already have a more recent version");
        // We already have a more recent update to this object.
        // We push that new version out again, just in case.
        if (this.value == null) {
          throw Error("value must not be null");
        }
        let obj: any = this.value.get(key);
        if (obj == null) {
          throw Error(`there must be an object in this.value with key ${key}`);
        }
        obj = obj.toJS();
        const version = this.versions[key];
        if (version == null) {
          throw Error(`object with key ${key} must have a version`);
        }
        versioned_changes.push({ obj, version });
        continue;
      }
      if (this.handle_new_val(new_val, undefined, "insert", false)) {
        const version = this.increment_version(key);
        this.changes[key] = time;
        this.update_has_uncommitted_changes();
        versioned_changes.push({ obj: new_val.toJS(), version });
        changed_keys.push(key);
      }
    }
    if (changed_keys.length > 0) {
      this.emit_change(changed_keys);
    }
    if (versioned_changes.length > 0) {
      this.emit("versioned-changes", versioned_changes);
    }
    dbg("project -- versioned --> clients", JSON.stringify(versioned_changes));
  }

  private increment_version(key: string): number {
    if (this.versions[key] == null) {
      this.versions[key] = this.initial_version;
    } else {
      this.versions[key] += 1;
    }
    this.emit("increased-versions", [key]);
    return this.versions[key];
  }

  private null_version(key: string): void {
    this.versions[key] = 0;
  }

  /*
  Apply one incoming change from the database to the
  in-memory table.
  */
  private update_change(change): void {
    if (this.state === "closed") {
      // We might get a few more updates even after
      // canceling the changefeed, so we just ignore them.
      return;
    }
    if (this.value == null) {
      console.warn(`update_change(${this.table}): ignored`);
      return;
    }
    this.emit("before-change");
    const changed_keys: string[] = [];
    const key = this.handle_new_val(
      change.new_val,
      change.old_val,
      change.action,
      this.coerce_types
    );
    if (key != null) {
      changed_keys.push(key);
    }

    //console.log("update_change: changed_keys=", changed_keys)
    if (changed_keys.length > 0) {
      //console.log("_update_change: change")
      this.emit_change(changed_keys);
    }
  }

  // Returns current time (in ms since epoch) on server,
  // but if there are multiple requests at the same time,
  // the clock is artificially incremented to ensure uniqueness.
  // Also, this time is thus always strictly increasing.
  private unique_server_time(): number {
    let tm = this.client.server_time().valueOf();
    if (tm <= this.last_server_time) {
      tm = this.last_server_time + 1;
    }
    this.last_server_time = tm;
    return tm;
  }

  // - returns key only if obj actually changed things.
  private handle_new_val(
    new_val: any,
    old_val: any,
    action: string,
    coerce: boolean
  ): string | undefined {
    if (this.value == null) {
      // to satisfy typescript.
      throw Error("value must be initialized");
    }

    if (action === "delete") {
      old_val = fromJS(old_val);
      if (old_val == null) {
        throw Error("old_val must not be null for delete action");
      }
      if (coerce && this.coerce_types) {
        old_val = this.do_coerce_types(old_val);
      }
      const key = this.obj_to_key(old_val);
      if (key == null || !this.value.has(key)) {
        return; // already gone
      }
      this.value = this.value.delete(key);
      return key;
    }

    new_val = fromJS(new_val);
    if (new_val == null) {
      throw Error("new_val must not be null for insert or update action");
    }
    if (coerce && this.coerce_types) {
      new_val = this.do_coerce_types(new_val);
    }
    const key = this.obj_to_key(new_val);
    if (key == null) {
      // This means the primary key is null or missing, which
      // shouldn't happen.  Maybe it could in some edge case.
      // For now, we shouldn't let this break everything, so:
      console.warn(
        this.table,
        "handle_new_val: ignoring invalid new_val ",
        new_val
      );
      return undefined;
      // throw Error("key must not be null");
    }
    const cur_val = this.value.get(key);
    if (action === "update" && cur_val != null) {
      // For update actions, we shallow *merge* in the change.
      // For insert action, we just replace the whole thing.
      new_val = cur_val.merge(new_val);
    }
    if (!new_val.equals(cur_val)) {
      this.value = this.value.set(key, new_val);
      return key;
    }
    return undefined;
  }

  /*
  obj is an immutable.js Map without the primary key
  set.  If the database schema defines a way to compute
  the primary key from other keys, try to use it here.
  This function returns the computed primary key (array or string)
  if it works, and returns undefined otherwise.
  */
  private computed_primary_key(obj): string[] | string | undefined {
    let f;
    if (this.primary_keys.length === 1) {
      f = this.client_query.set.fields[this.primary_keys[0]];
      if (typeof f === "function") {
        return f(obj.toJS(), schema.client_db);
      } else {
        return;
      }
    } else {
      const v: string[] = [];
      for (const pk of this.primary_keys) {
        f = this.client_query.set.fields[pk];
        if (typeof f === "function") {
          v.push(f(obj.toJS(), schema.client_db));
        } else {
          return;
        }
      }
      return v;
    }
  }

  private assert_not_closed(desc: string): void {
    if (this.state === "closed") {
      //console.trace();
      throw Error(
        `the synctable "${this.table}" must not be closed -- ${desc}`
      );
    }
  }

  // **WARNING:** Right now this *barely* works at all... due to
  // barely being implemented since I mostly haven't needed it.
  // It will delete the object from the database, but if some
  // client still has the object, they can end up just writing
  // it back.
  public async delete(obj): Promise<void> {
    // Table spec must have set.delete = true.
    // This function does a direct database query to delete
    // the entry with primary key described by obj from
    // the database.  That will have the side effect slightly
    // later of removing the object from this table.  This
    // thus works differently than making changes or
    // creating new entries, at least right now (since
    // implementing this properly is a lot of work but
    // not used much).

    const query = { [this.table]: obj };
    const options = [{ delete: true }];
    await callback2(this.client.query, { query, options });
  }
}
