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

import { global_cache_decref } from "./global-cache";

import { EventEmitter } from "events";
import { Map, fromJS, List, is as immutable_is, Iterable } from "immutable";

import { keys, throttle } from "underscore";

import { callback2, once } from "../../async-utils";

import { wait } from "../../async-wait";

import { query_function } from "./query-function";

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
  alert_message: Function;
  is_connected: () => boolean;
  is_signed_in: () => boolean;
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

type Changes = { [key: string]: { new_val: any; old_val: any } };

export class SyncTable extends EventEmitter {
  private changefeed?: Changefeed;
  private query: any;
  private client_query: any;
  private primary_keys: string[];
  private options: any[];
  private client: Client;
  private throttle_changes?: number;

  // The value of this query locally.
  private value_local?: Map<string, any>;

  // Our best guess as to the value of this query on the server,
  // according to queries and updates the server pushes to us.
  private value_server: Map<string, any> | null | undefined;

  // Not connected yet
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

  constructor(
    query,
    options: any[],
    client: Client,
    throttle_changes?: number,
    coerce_types?: boolean
  ) {
    super();

    if (coerce_types != undefined) {
      this.coerce_types = coerce_types;
    }

    if (misc.is_array(query)) {
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
    if (this.value_server == null && this.value_local == null) {
      return false;
    }
    if (this.value_server == null) {
      if (this.value_local == null) {
        return false;
      }
      return true;
    }
    if (this.value_local == null) {
      return false;
    }
    return !this.value_server.equals(this.value_local);
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
    if (this.value_local == null) {
      return;
    }

    if (arg == null) {
      return this.value_local;
    }

    if (misc.is_array(arg)) {
      const x = {};
      for (let k of arg) {
        const key: string | undefined = to_key(k);
        if (key != null) {
          x[key] = this.value_local.get(key);
        }
      }
      return fromJS(x);
    } else {
      const key = to_key(arg);
      return key != null ? this.value_local.get(key) : undefined;
    }
  }

  /*
  Get one record from this table.  Especially useful when
  there is only one record, which is an important special
  case (a so-called "wide" table?.)
  */
  public get_one(arg?): Map<string, any> | undefined {
    if (arg == null) {
      return this.value_local != null
        ? this.value_local.toSeq().first()
        : undefined;
    } else {
      // get only returns (at most) one object, so it's "get_one".
      return this.get(arg);
    }
  }

  private async wait_until_value_server(): Promise<void> {
    if (this.value_server == null) {
      // can't save until server sends state.  We wait.
      await once(this, "init-value-server");
      if (this.value_server == null) {
        throw Error("bug -- change should initialize value_server");
      }
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
    await this.wait_until_value_server();

    // quick easy check for unsaved changes and
    // ready to be saved
    let has_unsaved_changes =
      this.value_server != null &&
      this.value_local != null &&
      this.value_server != this.value_local;
    while (has_unsaved_changes && this.state !== "closed") {
      if (this.state !== "connected") {
        // wait for state change
        await once(this, "state");
      }
      if (this.state === "connected") {
        // switched to connected so try to save once
        has_unsaved_changes = await this._save();
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
  but is worth it for sanity's sake!
  */
  public set(changes: any, merge: "deep" | "shallow" | "none" = "deep"): any {
    this.assert_not_closed();

    if (!Map.isMap(changes)) {
      changes = fromJS(changes);
      if (!misc.is_object(changes)) {
        throw Error(
          "type error -- changes must be an immutable.js Map or JS map"
        );
      }
    }
    if (this.value_local == null) {
      this.value_local = Map({});
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
    let id: string | undefined = this.obj_to_key(changes);
    if (id == null) {
      // attempt to compute primary key if it is a computed primary key
      let id0 = this.computed_primary_key(changes);
      id = to_key(id0);
      if (id == null && this.primary_keys.length === 1) {
        // use a "random" primary key from existing data
        id0 = id = this.value_local.keySeq().first();
      }
      if (id == null) {
        throw Error(
          `must specify primary key ${this.primary_keys.join(
            ","
          )}, have at least one record, or have a computed primary key`
        );
      }
      // Now id is defined
      if (this.primary_keys.length === 1) {
        changes = changes.set(this.primary_keys[0], id0);
      } else if (this.primary_keys.length > 1) {
        if (id0 == null) {
          // to satisfy typescript.
          throw Error("bug -- computed primary key must be an array");
        }
        let i = 0;
        for (let pk of this.primary_keys) {
          changes = changes.set(pk, id0[i]);
          i += 1;
        }
      }
    }

    // Get the current value
    const cur = this.value_local.get(id);
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
      // Use the appropriate merge strategy to get the next val.  Fortunately these are all built
      // into immutable.js!
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
    // If something changed, then change in our local store,
    // and also kick off a save to the backend.
    if (!immutable_is(new_val, cur)) {
      this.value_local = this.value_local.set(id, new_val);
      this.emit_change([id]);
      this.save();
    }

    return new_val;
  }

  public close(fatal: boolean = false) {
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
    this.client.removeListener("disconnected", this.disconnected);
    if (!fatal) {
      // do a last attempt at a save (so we don't lose data),
      // then really close.
      this._save(); // this will synchronously construct the last save and send it
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
    delete this.value_local;
    delete this.value_server;
  }

  public async wait(until: Function, timeout: number = 30): Promise<any> {
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
      console.warn("failed to connect -- ", err);
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
    do_emit_changes = throttle(do_emit_changes, this.throttle_changes);
    this.emit_change = changed_keys => {
      //console.log("emit_change", changed_keys);
      this.dbg("emit_change")(changed_keys);
      //console.log("#{this.table} -- queue changes", changed_keys)
      for (let key of changed_keys) {
        all_changed_keys[key] = true;
      }
      this.emit("change-no-throttle", changed_keys);
      do_emit_changes();
    };
  }

  private dbg(_f?: string): Function {
    /*
    if (this.client.is_project()) {
      return this.client.dbg(
        `SyncTable('${JSON.stringify(this.query)}').${_f}`
      );
    }*/
    return () => {};
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
    if (this.value_local != null && this.value_server != null) {
      dbg("save any unsaved changes first");
      await this.save();
    }

    // 2. Now actually setup the changefeed.
    dbg("actually setup changefeed");
    await this.create_changefeed();
    dbg("connect should have succeeded");
  }

  private async create_changefeed(): Promise<void> {
    const dbg = this.dbg("create_changefeed");
    if (this.state === "closed") {
      dbg("closed so don't do anything ever again");
      return;
    }
    dbg("creating changefeed connection...");
    const initval = await this.create_changefeed_connection();
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
    // For tables where always being perfectly 100% up to date is
    // critical, which is many of them (e.g., patches, projects).
    this.close_changefeed();
    this.changefeed = new Changefeed(this.changefeed_options());
    await this.wait_until_ready_to_query_db();
    return await this.changefeed.connect();
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
    if (misc.len(tables) !== 1) {
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

    if (!misc.is_array(this.query[this.table])) {
      throw Error("must be a multi-document queries");
    }
    this.primary_keys = schema.client_db.primary_keys(this.table);
    // TODO: could put in more checks on validity of query here, using schema...
    for (let primary_key of this.primary_keys) {
      if (this.query[this.table][0][primary_key] == null) {
        // must include each primary key in query
        this.query[this.table][0][primary_key] = null;
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

  /*
  Return map from keys that have changed along with how
  they changed, or undefined if the value of local or
  the server hasn't been initialized.
  */
  private get_changes(): Changes | undefined {
    return this.value_diff(this.value_server, this.value_local);
  }

  // a and b are actually maps from string to Map<string, any>.
  private value_diff(
    a: Map<string, any> | null | undefined,
    b: Map<string, any> | null | undefined
  ): Changes | undefined {
    if (a == null || b == null) {
      return;
    }
    const changed = {};
    b.forEach((new_val, key) => {
      if (a == null || key == null) {
        // because typescript doesn't know the callback is synchronous.
        return;
      }
      const old_val = a.get(key);
      if (!new_val.equals(old_val)) {
        changed[key] = { new_val, old_val };
      }
    });
    a.forEach((new_val, key) => {
      if (b == null || key == null || changed[key]) {
        return;
      }
      const old_val = b.get(key);
      if (!new_val.equals(old_val)) {
        changed[key] = { new_val, old_val };
      }
    });
    return changed;
  }

  /* Send all unsent changes.
     This function must not be called more than once at a time.
     Returns boolean:
        false -- there are no additional changes to be saved
        true -- new changes appeared during the _save that need to be saved.
  */
  private async _save(): Promise<boolean> {
    //console.log("_save", this.table);
    await this.wait_until_ready_to_query_db();
    await this.wait_until_value_server();
    if (this.state === "closed") {
      return false;
    }
    // what their new values are.
    if (this.value_server == null || this.value_local == null) {
      return false;
    }

    if (this.client_query.set == null) {
      // Nothing to do -- can never set anything for this table.
      // There are some tables (e.g., stats) where the remote values
      // could change while user is offline, and the code below would
      // result in warnings.
      return false;
    }

    const changed = this.get_changes();
    if (changed == null) {
      return false;
    }
    const at_start = this.value_local;

    // Send our changes to the server.
    const query: any[] = [];
    const saved_objs: any[] = [];
    // sort so that behavior is more predictable = faster
    // (e.g., sync patches are in
    // order); the keys are strings so default sort is fine
    for (let key of keys(changed).sort()) {
      if (key == null) continue;
      const c = changed[key];
      const obj = {};
      // NOTE: this may get replaced below with proper
      // javascript, e.g., for compound primary key
      if (this.primary_keys.length === 1) {
        obj[this.primary_keys[0]] = key;
      } else {
        // unwrap compound primary key
        let v = JSON.parse(key);
        let i = 0;
        for (let primary_key of this.primary_keys) {
          obj[primary_key] = v[i];
          i += 1;
        }
      }

      for (let k of this.set_fields) {
        const v = c.new_val.get(k);
        if (v != null) {
          if (
            this.required_set_fields[k] ||
            !immutable_is(v, c.old_val != null ? c.old_val.get(k) : undefined)
          ) {
            if (Iterable.isIterable(v)) {
              obj[k] = v.toJS();
            } else {
              obj[k] = v;
            }
          }
        }
      }
      query.push({ [this.table]: obj });
      saved_objs.push(obj);
    }

    // console.log("sending #{query.length} changes: #{misc.to_json(query)}")
    if (query.length === 0) {
      return false;
    }

    this.emit("saved-objects", saved_objs);

    //console.log("query=#{misc.to_json(query)}")
    //Use this to test fix_if_no_update_soon:
    //    if Math.random() <= .5
    //        query = []
    //this.fix_if_no_update_soon() # -disabled -- instead use "checking changefeed ids".
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

      console.warn(`_save('${this.table}') error:`, err);
      if (
        err
          .toString()
          .toLowerCase()
          .indexOf("clock") != -1
      ) {
        this.client.alert_message({
          type: "error",
          timeout: 9999,
          message:
            "Your computer's clock is or was off!  Fix it and **refresh your browser**."
        });
      }
      return true;
    }
    if (this.state === ("closed" as State)) {
      // this can happen in case synctable is closed after
      // _save is called but before returning from this query.
      return false;
    }
    if (this.value_server == null || this.value_local == null) {
      // should not happen
      return false;
    }
    // success: each change in the query that committed
    // successfully to the database; we can safely set
    // this.value_server (for each value) as long as
    // it didn't change in the meantime.
    for (let k in changed) {
      const v = changed[k];
      if (immutable_is(this.value_server.get(k), v.old_val)) {
        // immutable.is since either could be undefined
        //console.log "setting this.value_server[#{k}] =", v.new_val?.toJS()
        this.value_server = this.value_server.set(k, v.new_val);
      }
    }
    // return true if there are new unsaved changes:
    return !at_start.equals(this.value_local);
  }

  // Return modified immutable Map, with all types coerced to be
  // as specified in the schema, if possible, or throw an exception.
  private do_coerce_types(changes: Map<string, any>): Map<string, any> {
    const t = schema.SCHEMA[this.table];
    if (t == null) {
      throw Error(`Missing schema for table ${this.table}`);
    }
    const fields = t.fields;
    if (fields == null) {
      throw Error(`Missing fields part of schema for table ${this.table}`);
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
          console.warn(changes, fields);
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
              throw Error("must be an immutable.js list");
            }
          }
          return value;
        }
        if (desired === "map") {
          if (!Map.isMap(value)) {
            value = fromJS(value);
            if (!Map.isMap(value)) {
              throw Error("must be an immutable.js map");
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

    if (this.value_local != null || this.value_server != null) {
      throw Error("update_all both value_local and value_server must be null");
    }

    this.emit("before-change");
    // Restructure the array of records in v as a mapping
    // from the primary key to the corresponding record.
    const x = {};
    for (let y of v) {
      let key = this.obj_to_key(y);
      if (key != null) {
        x[key] = y;
      }
    }
    const changed_keys = keys(x); // of course all keys have been changed.

    this.value_server = fromJS(x);

    if (this.value_server == null) {
      throw Error("bug -- make typescript happy");
    }

    if (this.coerce_types) {
      // Ensure all values are properly coerced, as specified
      // in the database schema.  This is important, e.g., since
      // when mocking the client db query, JSON is involved and
      // timestamps are not parsed to Date objects.
      this.value_server = <Map<string, any>>(
        this.value_server.map((value, _) => this.do_coerce_types(value))
      );
    }

    this.value_local = this.value_server;

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

  /* Simulate incoming values as they would come from upstream via
     a changefeed.  This is used, e.g., by project-based tables.
     Important: new_val and old_val are plain JS objects, *not*
     immutable maps.
 */
  public synthetic_change(data: { new_val?: any[]; old_val?: any[] }): void {
    const dbg = this.dbg("synthetic_change");
    dbg(data);
    this.assert_not_closed();
    if (this.value_server == null) {
      if (data.new_val == null) {
        throw Error("new_val must be set");
      }
      this.update_all(data.new_val);
      return;
    }

    if (data.old_val != null) {
      for (let old_val of data.old_val) {
        this.synthetic_change1({ old_val });
      }
    }
    if (data.new_val != null) {
      for (let new_val of data.new_val) {
        this.synthetic_change1({ new_val });
      }
    }
  }

  private synthetic_change1(change: { new_val?: any; old_val?: any }): void {
    if (change.new_val == null) {
      if (change.old_val != null) {
        this.update_change(change); // delete
        return;
      }
      return;
    }
    // Setting a new_val.  Our internal code assumes the changefeed
    // provides complete objects. However, that is pretty wasteful
    // in practice, and the project-based sync protocol doesn't
    const key = this.obj_to_key(change.new_val);
    // value_server part for typescript.
    if (key != null && this.value_server != null) {
      let server = this.value_server.get(key);
      if (server != null) {
        server = server.toJS();
        for (let k in server) {
          if (change.new_val[k] === undefined) {
            change.new_val[k] = server[k];
          }
        }
      }
    }
    this.update_change(change);
  }

  /*
  Apply one incoming change from the database to the
  in-memory local synchronized table.
  */
  private update_change(change): void {
    //console.log("_update_change", change)
    if (this.state === "closed") {
      // We might get a few more updates even after
      // canceling the changefeed, so we just ignore them.
      return;
    }
    if (this.value_local == null) {
      console.warn(
        `_update_change(${
          this.table
        }): tried to call _update_change even though local not yet defined (ignoring)`
      );
      return;
    }
    if (this.value_server == null) {
      console.warn(
        `_update_change(${
          this.table
        }): tried to call _update_change even though set not yet defined (ignoring)`
      );
      return;
    }

    if (DEBUG) {
      console.log(`_update_change('${this.table}'): ${misc.to_json(change)}`);
    }
    this.emit("before-change");
    const changed_keys: string[] = [];
    let conflict: boolean = false;
    if (change.new_val != null) {
      conflict = this.handle_new_val(change.new_val, changed_keys);
    }

    if (
      change.old_val != null &&
      this.obj_to_key(change.old_val) !== this.obj_to_key(change.new_val)
    ) {
      // Delete a record (TODO: untested)
      const key = this.obj_to_key(change.old_val);
      if (key != null) {
        this.value_local = this.value_local.delete(key);
        this.value_server = this.value_server.delete(key);
        changed_keys.push(key);
      }
    }

    //console.log("update_change: changed_keys=", changed_keys)
    if (changed_keys.length > 0) {
      //console.log("_update_change: change")
      this.emit_change(changed_keys);
      if (conflict) {
        this.save();
      }
    }
  }

  // - changed_keys gets mutated during this call
  // - returns true only if there is a conflict (??)
  private handle_new_val(val: any, changed_keys: string[]): boolean {
    if (this.value_local == null || this.value_server == null) {
      // to satisfy typescript.
      return false;
    }
    const key = this.obj_to_key(val);
    if (key == null) {
      return false;
    }
    let new_val = fromJS(val);
    if (this.coerce_types) {
      new_val = this.do_coerce_types(new_val);
    }
    let local_val = this.value_local.get(key);
    let conflict = false;
    if (!new_val.equals(local_val)) {
      //console.log("change table='#{this.table}': #{misc.to_json(local_val?.toJS())} --> #{misc.to_json(new_val.toJS())}") if this.table == 'patches'
      if (local_val == null) {
        this.value_local = this.value_local.set(key, new_val);
        changed_keys.push(key);
      } else {
        const server = this.value_server.get(key);
        // Set in this.value_local every key whose value changed
        // between new_val and server; basically, we're
        // determining and applying the "patch" from upstream,
        // even though it was sent as a complete record.
        // We can compute the patch, since we know the
        // last server value.
        new_val.forEach((v, k) => {
          if (server == null || !immutable_is(v, server.get(k))) {
            local_val = local_val.set(k, v);
          }
        });
        //console.log("#{this.table}: set #{k} to #{v}")
        if (server != null) {
          server.forEach((_, k) => {
            if (!new_val.has(k)) {
              local_val = local_val.delete(k);
            }
          });
        }
        if (!local_val.equals(this.value_local.get(key))) {
          this.value_local = this.value_local.set(key, local_val);
          changed_keys.push(key);
        }
        if (!local_val.equals(new_val)) {
          //console.log("#{this.table}: conflict! ", local_val, new_val) if this.table == 'patches'
          this.emit("conflict", { new_val, old_val: local_val });
          conflict = true;
        }
      }
    }
    this.value_server = this.value_server.set(key, new_val);
    return conflict;
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
      throw Error("closed");
    }
  }
}
