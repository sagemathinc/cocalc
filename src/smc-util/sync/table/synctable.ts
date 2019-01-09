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

import { keys, throttle } from "underscore";

import { callback2, cancel_scheduled, once } from "../../async-utils";

import { wait } from "../../async-wait";

import { query_function } from "./query-function";

import { copy, is_array, is_object, len } from "../../misc2";

const misc = require("../../misc");
const schema = require("../../schema");

// What we need the client below to implement so we can use
// it to support a table.
export interface Client extends EventEmitter {
  is_project: () => boolean;
  dbg: (string) => Function;
  query: (
    opts: { query: any; options?: any[]; timeout?: number; cb?: Function }
  ) => void;
  query_cancel: Function;
  server_time: Function;
  alert_message: Function;
  is_connected: () => boolean;
  is_signed_in: () => boolean;
}

export interface VersionedChange {
  obj: { [key: string]: any };
  version: number;
}

export interface TimedChange {
  obj: { [key: string]: any };
  time: number; // ms since epoch
}

function is_fatal(err): boolean {
  return (
    typeof err === "string" &&
    err.slice(0, 5) === "FATAL" &&
    err.indexOf("tracker") === -1
  );
}

import { reuseInFlight } from "async-await-utils/hof";

import { Changefeed } from "./changefeed";
import { parse_query, to_key } from "./util";

type State = "disconnected" | "connected" | "closed";

export class SyncTable extends EventEmitter {
  private changefeed?: Changefeed;
  private query: any;
  private client_query: any;
  private primary_keys: string[];
  private options: any[];
  public client: Client;
  private throttle_changes?: number;
  private throttled_emit_changes?: Function;

  // Immutable map -- the value of this synctable.
  private value?: Map<string, Map<string, any>>;

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
  private table: string;
  private schema: any;
  private emit_change: Function;
  public reference_count: number = 0;
  public cache_key: string | undefined;
  // Which fields the user is allowed to set.
  // Gets updaed during init.
  private set_fields: string[] = [];
  // Which fields *must* be included in any set query.
  // Also updated during init.
  private required_set_fields: { [key: string]: boolean } = {};

  private coerce_types: boolean = false;
  private no_changefeed: boolean = false;

  constructor(
    query,
    options: any[],
    client: Client,
    throttle_changes?: number,
    coerce_types?: boolean,
    no_changefeed?: boolean
  ) {
    super();

    if (coerce_types != undefined) {
      this.coerce_types = coerce_types;
    }
    if (no_changefeed != undefined) {
      this.no_changefeed = no_changefeed;
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

  /*
  Return true if there are changes to this synctable that
  have NOT been confirmed as saved to the backend database.
  (Always returns false when not yet initialized.)
  */
  public has_uncommitted_changes(): boolean {
    this.assert_not_closed();
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
    this.assert_not_closed();

    if (this.value == null) {
      throw Error("table not yet initialized");
    }

    if (arg == null) {
      return this.value;
    }

    if (is_array(arg)) {
      let x: Map<string, Map<string, any>> = Map();
      for (let k of arg) {
        const key: string | undefined = to_key(k);
        if (key != null) {
          x = x.set(key, this.value.get(key));
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
    this.assert_not_closed();
    if (this.value == null) {
      // nothing to save yet
      return;
    }

    while (this.has_uncommitted_changes()) {
      if (this.state !== "connected") {
        // wait for state change
        await once(this, "state");
      }
      if (this.state === "connected") {
        if (!(await this._save())) {
          return;
        }
      }
      // else switched to something else (?), so
      // loop around and wait again for a change...
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
  Causes a save if their are changes.

  NOTE: we always use db schema to ensure types are correct,
  converting if necessary.   This has a performance impact,
  but is worth it for sanity's sake!!!
  */
  public set(changes: any, merge: "deep" | "shallow" | "none" = "deep"): any {
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
      console.log(`set('${this.table}'): ${misc.to_json(changes.toJS())}`);
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
        for (let pk of this.primary_keys) {
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
      for (let k in this.required_set_fields) {
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

    // Something changed:
    this.value = this.value.set(key, new_val);
    this.changes[key] = this.client.server_time().valueOf();
    if (this.client.is_project()) {
      // project assigns versions
      const version = this.increment_version(key);
      const obj = new_val.toJS();
      this.emit("versioned-changes", [{ obj, version }]);
    } else {
      // browser gets them assigned...
      this.null_version(key);
    }
    this.emit_change([key]);

    return new_val;
  }

  public async close(fatal: boolean = false): Promise<void> {
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
    if (!fatal) {
      // do a last attempt at a save (so we don't lose data),
      // then really close.
      await this.save(); // attempt last save to database.
    }
    /*
    The moment the sync part of _save is done, we remove listeners
    and clear everything up.  It's critical that as soon as close
    is called that there be no possible way any further connect
    events (etc) can make this SyncTable
    do anything!!  That finality assumption is made
    elsewhere (e.g in smc-project/client.coffee)
    */

    this.close_changefeed();
    this.set_state("closed");
    this.removeAllListeners();
    delete this.value;
  }

  public async wait(until: Function, timeout: number = 30): Promise<any> {
    this.assert_not_closed();

    return await wait({
      obj: this,
      until,
      timeout,
      change_event: "change-no-throttle"
    });
  }

  /* INTERNAL PRIVATE METHODS */

  private async first_connect(): Promise<void> {
    try {
      await this.connect();
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
    let do_emit_changes = () => {
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
    this.emit_change = changed_keys => {
      //console.log("emit_change", changed_keys);
      this.dbg("emit_change")(changed_keys);
      //console.log("#{this.table} -- queue changes", changed_keys)
      for (let key of changed_keys) {
        all_changed_keys[key] = true;
      }
      this.emit("change-no-throttle", changed_keys);
      if (this.throttled_emit_changes != null) {
        this.throttled_emit_changes();
      }
    };
  }

  private dbg(_f?: string): Function {
    return () => {};
    return (...args) => {
      console.log(`synctable("${this.table}").${_f}: `, ...args);
    };
    /*
    if (this.client.is_project()) {
      return this.client.dbg(
        `SyncTable('${JSON.stringify(this.query)}').${_f}`
      );
    }
    return () => {};
    */
  }

  private async connect(): Promise<void> {
    const dbg = this.dbg("connect");
    dbg();
    this.assert_not_closed();
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
    while (true) {
      this.close_changefeed();
      this.changefeed = new Changefeed(this.changefeed_options());
      await this.wait_until_ready_to_query_db();
      try {
        return await this.changefeed.connect();
      } catch (err) {
        // This can happen because we might suddenly NOT be ready
        // to query db immediately after we are ready...
        console.warn(
          `${this.table} -- failed to connect -- ${err}; will retry`
        );
        await delay(1000);
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
      query_cancel: this.client.query_cancel,
      options: this.options,
      query: this.query,
      table: this.table
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
    const dbg = this.dbg("_disconnected");
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
    for (let primary_key of this.primary_keys) {
      if (this.query[this.table][0][primary_key] === undefined) {
        throw Error(
          `must include each primary key in query of table '${
            this.table
          }', but you missed '${primary_key}'`
        );
      }
    }
    // Check that all keys in the query are allowed by the schema.
    for (let query_key of keys(this.query[this.table][0])) {
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
      this.obj_to_key = obj => {
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
      this.obj_to_key = obj => {
        if (obj == null) {
          return;
        }
        const v: string[] = [];
        if (Map.isMap(obj)) {
          for (let pk of this.primary_keys) {
            const a = obj.get(pk);
            if (a == null) {
              return;
            }
            v.push(a);
          }
        } else {
          for (let pk of this.primary_keys) {
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
      for (let field of keys(this.query[this.table][0])) {
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
        true -- new changes appeared during the _save that need to be saved.
  */
  private async _save(): Promise<boolean> {
    if (this.get_state() == "closed") return false;
    if (this.client_query.set == null) {
      // Nothing to do -- can never set anything for this table.
      // There are some tables (e.g., stats) where the remote values
      // could change while user is offline, and the code below would
      // result in warnings.
      return false;
    }
    //console.log("_save", this.table);
    await this.wait_until_ready_to_query_db();
    if (this.get_state() == "closed") return false;
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
    for (let key in this.changes) {
      if (this.versions[key] === 0) {
        proposed_keys[key] = true;
      }
      const x = this.value.get(key);
      if (x == null) {
        throw Error("delete is not implemented");
      }
      const obj = x.toJS();

      const qobj = {}; // qobj is the db query version of obj.
      // Set the primary key part:
      if (this.primary_keys.length === 1) {
        qobj[this.primary_keys[0]] = key;
      } else {
        // unwrap compound primary key
        let v = JSON.parse(key);
        let i = 0;
        for (let primary_key of this.primary_keys) {
          qobj[primary_key] = v[i];
          i += 1;
        }
      }

      // Can only send set_field sets to the database.
      for (let k of this.set_fields) {
        qobj[k] = x.get(k);
      }
      query.push({ [this.table]: qobj });
      timed_changes.push({ obj, time: this.changes[key] });
    }
    this.emit("timed-changes", timed_changes);

    if (!this.no_changefeed) {
      try {
        await callback2(this.client.query, {
          query,
          options: [{ set: true }], // force it to be a set query
          timeout: 30
        });
      } catch (err) {
        if (is_fatal(err)) {
          console.warn("FATAL doing set", this.table, err);
          this.close(true);
          throw err;
        }
        console.warn(
          `_save('${this.table}') set query error:`,
          err,
          " query=",
          query
        );
        return true;
      }
    }

    if (this.get_state() == "closed") return false;
    if (this.value == null) {
      // should not happen
      return false;
    }

    if (this.no_changefeed) {
      // Not using changefeeds, so have to depend on other mechanisms
      // to update state.  Wait until changes to proposed keys are
      // acknowledged by their version being assigned.
      try {
        await this.wait_until_versions_are_updated(proposed_keys, 5000);
      } catch (err) {
        // took too long -- try again to send and receive changes.
        return true;
      }
    }

    // Record that we successfully sent these changes
    for (let key in changes) {
      if (changes[key] == this.changes[key]) {
        delete this.changes[key];
      }
    }

    return !misc.is_equal(changes, this.changes);
  }

  private async wait_until_versions_are_updated(
    proposed_keys: { [key: string]: boolean },
    timeout_ms: number
  ): Promise<void> {
    const start_ms = new Date().valueOf();
    while (len(proposed_keys) > 0) {
      for (let key in proposed_keys) {
        if (this.versions[key] > 0) {
          delete proposed_keys[key];
        }
      }
      if (len(proposed_keys) > 0) {
        const elapsed_ms = new Date().valueOf() - start_ms;
        const keys : string[] = await once(
          this,
          "update-versions",
          timeout_ms - elapsed_ms
        );
        for (let key of keys) {
          delete proposed_keys[key];
        }
      }
    }
  }

  // Return modified immutable Map, with all types coerced to be
  // as specified in the schema, if possible, or throw an exception.
  private do_coerce_types(changes: Map<string, any>): Map<string, any> {
    const t = schema.SCHEMA[this.table];
    if (t == null) {
      throw Error(`Missing schema for table ${this.table}`);
    }
    const fields = copy(t.fields);
    if (fields == null) {
      throw Error(`Missing fields part of schema for table ${this.table}`);
    }
    if (typeof this.query != "string") {
      // explicit query (not just from schema)
      let x = this.query[this.table];
      if (is_array(x)) {
        x = x[0];
      }
      for (let k in fields) {
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
        const spec = fields[field];
        if (spec == null) {
          //console.warn(changes, fields);
          throw Error(
            `Cannot coerce: no field '${field}' in table ${this.table}`
          );
        }
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
          misc.assert_uuid(value);
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
    for (let y of v) {
      let key = this.obj_to_key(y);
      if (key != null) {
        x[key] = y;
        // initialize all version numbers
        this.versions[key] = this.initial_version;
      }
    }
    const changed_keys = keys(x); // of course all keys have been changed.
    this.emit("update-versions", changed_keys);

    this.value = fromJS(x);
    if (this.value == null) {
      throw Error("bug");
    }
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
    this.apply_changes_to_browser_client(changes);
  }

  public apply_changes_to_browser_client(changes: VersionedChange[]): void {
    const dbg = this.dbg("apply_changes_to_browser_client");
    dbg("got ", changes.length, "changes");
    this.assert_not_closed();
    if (this.value == null) {
      // initializing the synctable.
      this.value = Map();
    }

    this.emit("before-change");
    const changed_keys: string[] = [];

    for (let change of changes) {
      const { obj, version } = change;
      const new_val = this.do_coerce_types(fromJS(obj));
      const key = this.obj_to_key(new_val);
      if (key == null) {
        throw Error("object results in null key");
      }
      const cur_version = this.versions[key] ? this.versions[key] : 0;
      if (cur_version > version) {
        // nothing further to do.
        continue;
      }
      if (this.handle_new_val(new_val, false)) {
        changed_keys.push(key);
      }
      // Update our version to the new version.
      this.versions[key] = version;
      this.emit("update-versions", [key]);
    }

    if (changed_keys.length > 0) {
      this.emit_change(changed_keys);
    }
  }

  public apply_changes_from_browser_client(changes: TimedChange[]): void {
    const changed_keys: string[] = [];
    const versioned_changes: VersionedChange[] = [];
    for (let change of changes) {
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
        // We already have a more recent update to this object.
        continue;
      }
      if (this.handle_new_val(new_val, false)) {
        let version = this.increment_version(key);
        this.changes[key] = time;
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
  }

  private increment_version(key: string): number {
    if (this.versions[key] == null) {
      this.versions[key] = this.initial_version;
    } else {
      this.versions[key] += 1;
    }
    this.emit("update-versions", [key]);
    return this.versions[key];
  }

  private null_version(key: string): void {
    this.versions[key] = 0;
    this.emit("update-versions", [key]);
  }

  /*
  Apply one incoming change from the database to the
  in-memory table.
  */
  private update_change(change): void {
    //console.log("_update_change", change)
    if (this.state === "closed") {
      // We might get a few more updates even after
      // canceling the changefeed, so we just ignore them.
      return;
    }
    if (this.value == null) {
      console.warn(`_update_change(${this.table}): ignored`);
      return;
    }
    this.emit("before-change");
    const changed_keys: string[] = [];
    if (change.new_val != null) {
      const key = this.handle_new_val(change.new_val);
      if (key != null) {
        changed_keys.push(key);
      }
    }

    if (
      change.old_val != null &&
      this.obj_to_key(change.old_val) !== this.obj_to_key(change.new_val)
    ) {
      // Delete a record (TODO: untested)
      const key = this.obj_to_key(change.old_val);
      if (key != null) {
        this.value = this.value.delete(key);
        changed_keys.push(key);
      }
    }

    //console.log("update_change: changed_keys=", changed_keys)
    if (changed_keys.length > 0) {
      //console.log("_update_change: change")
      this.emit_change(changed_keys);
    }
  }

  // - returns key only if obj actually changed things.
  private handle_new_val(obj: any, coerce: boolean = true): string | undefined {
    if (this.value == null) {
      // to satisfy typescript.
      throw Error("value must be initialized");
    }
    let new_val = fromJS(obj);
    if (new_val == null) {
      throw Error("new_val must not be null");
    }
    if (coerce && this.coerce_types) {
      new_val = this.do_coerce_types(new_val);
    }
    const key = this.obj_to_key(new_val);
    if (key == null) {
      throw Error("key must not be null");
    }
    let cur_val = this.value.get(key);
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
      for (let pk of this.primary_keys) {
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

  private assert_not_closed(): void {
    if (this.state === "closed") {
      //console.trace();
      throw Error("closed");
    }
  }
}
