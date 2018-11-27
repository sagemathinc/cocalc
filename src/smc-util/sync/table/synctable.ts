// CoCalc, Copyright (C) 2018, Sagemath Inc.

// If true, will log to the console a huge amount of
// info about every get/set
let DEBUG: boolean = false;

export function set_debug(x: boolean): void {
  DEBUG = x;
}

import { global_cache_decref } from "./global-cache";

import { EventEmitter } from "events";
import { Map, fromJS, is as immutable_is, Iterable } from "immutable";

import { keys, throttle } from "underscore";

import { callback } from "awaiting";

import { callback2, once } from "../../async-utils";

import { query_function } from "./query-function";

const misc = require("../../misc");
const schema = require("../../schema");

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
  private client: any;
  private throttle_changes?: number;

  // The value of this query locally.
  private value_local?: Map<string, any>;

  // Our best guess as to the value of this query on the server,
  // according to queries and updates the server pushes to us.
  private value_server?: Map<string, any>;

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

  constructor(query, options: any[], client, throttle_changes?: number) {
    super();

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

    // So only ever called once
    this.save = reuseInFlight(this.save.bind(this));

    this.first_connect();
  }

  /* PUBLIC API */
  public get_state(): string {
    return this.state;
  }

  /*
  Return true if there are changes to this synctable that
  have NOT been confirmed as saved to the backend database.
  Returns undefined if not initialized.
  */
  public has_uncommitted_changes(): boolean | undefined {
    if (this.value_server == null && this.value_local == null) {
      return;
    }
    if (this.value_server == null) {
      if (this.value_local == null) {
        return;
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
  */
  public get(arg): Map<string, any> | undefined {
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
  public get_one(): Map<string, any> | undefined {
    return this.value_local != null
      ? this.value_local.toSeq().first()
      : undefined;
  }

  /*
  Ensure any unsent changes are sent to the backend.
  When this function returns there are no unsent changes,
  since it keeps calling _save until nothing has changed
  locally.
  */
  public async save(): Promise<void> {
    console.log("save");
    this.assert_not_closed();
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
  Raises an async exception if something goes wrong.
  Returns promise that resolves to the updated value otherwise.
  */
  public async set(
    changes: any,
    merge: "deep" | "shallow" | "none" = "deep"
  ): Promise<any> {
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
      this.save();
      // CRITICAL: other code assumes the key is *NOT*
      // sent with this change event!
      this.emit_change([id]);
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
    // wait until some function until of this synctable is truthy (or throws an exception)
    // (this might be exactly the same code as in the
    // postgres-synctable.coffee SyncTable....)
    // Waits until "until(this)" evaluates to something truthy
    // in *seconds* -- set to 0 to disable (sort of DANGEROUS, obviously.)
    // Returns until(this) on success and raises Error('timeout') or
    // Error('closed') on failure.

    // The until function may be async.

    this.assert_not_closed();
    let x = await until(this);
    if (x) {
      // Already true
      return x;
    }

    const wait = cb => {
      let fail_timer: any = undefined;
      const done = (err, ret?) => {
        this.removeListener("change", f);
        this.removeListener("close", f);
        if (fail_timer !== undefined) {
          clearTimeout(fail_timer);
          fail_timer = undefined;
        }
        cb(err, ret);
      };
      const f = () => {
        if (this.state === "closed") {
          done("closed");
          return;
        }
        try {
          x = await until(this);
        } catch (err) {
          done(err);
          return;
        }
        if (x) {
          done(undefined, x);
        }
      };
      this.on("change", f);
      this.on("close", f);
      if (timeout) {
        const fail = () => {
          done("timeout");
        };
        fail_timer = setTimeout(fail, 1000 * timeout);
      }
    };

    return await callback(wait);
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
    this.emit("state", state);
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
      this.emit_change = changed_keys => this.emit("change", changed_keys);
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
      //console.log("#{this.table} -- queue changes", changed_keys)
      for (let key of changed_keys) {
        all_changed_keys[key] = true;
      }
      do_emit_changes();
    };
  }

  private dbg(_?: string): Function {
    // return this.client.dbg(`SyncTable('${this.table}').${_}`)
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
      await this.save();
    }

    // 2. Now actually setup the changefeed.
    await this.create_changefeed();
  }

  private async create_changefeed(): Promise<void> {
    const dbg = this.dbg("do_connect_query");
    if (this.state === "closed") {
      dbg("closed so don't do anything ever again");
      return;
    }
    const initval = await this.create_changefeed_connection();
    this.init_changefeed_handlers();
    this.update_all(initval);
    this.set_state("connected");
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
      // state already achieved
      return;
    }

    await once(this.client, client_state);
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
    if (this.value_server == null || this.value_local == null) {
      return;
    }
    const changed = {};
    this.value_local.map((new_val, key) => {
      if (this.value_server == null || key == null) {
        // because typescript doesn't know the callback is synchronous.
        return;
      }
      const old_val = this.value_server.get(key);
      if (!new_val.equals(old_val)) {
        return (changed[key] = { new_val, old_val });
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
    console.log("_save");
    await this.wait_until_ready_to_query_db();
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
    // sort so that behavior is more predictable = faster (e.g., sync patches are in
    // order); the keys are strings so default sort is fine
    for (let key of keys(changed).sort()) {
      if (key == null) continue;
      const c = changed[key];
      const obj = {};
      // NOTE: this may get replaced below with proper javascript, e.g., for compound primary key
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

  /*
  Handle an update of all records from the database.
  This happens on initialization, and also if we
  disconnect and reconnect.
  */
  private update_all(v: any[]): void {
    let changed_keys, first_connect;
    const dbg = this.dbg("update_all");

    if (this.state === "closed") {
      // nothing to do -- just ignore updates from db
      return;
    }

    this.emit("before-change");
    // Restructure the array of records in v as a mapping from the primary key
    // to the corresponding record.
    const x = {};
    for (let y of v) {
      let key = this.obj_to_key(y);
      if (key != null) {
        x[key] = y;
      }
    }

    let conflict = false;

    // Figure out what to change in our local view of the database query result.
    if (this.value_local == null || this.value_server == null) {
      dbg(
        "easy case -- nothing has been initialized yet, so just set everything."
      );
      this.value_local = this.value_server = fromJS(x);
      first_connect = true;
      changed_keys = keys(x); // of course all keys have been changed.
    } else {
      dbg("harder case -- everything has already been initialized.");
      changed_keys = [];

      // DELETE or CHANGED:
      // First check through each key in our local view of the query
      // and if the value differs from what is in the database (i.e.,
      // what we just got from DB), make that change.
      // (Later we will possibly merge in the change
      // using the last known upstream database state.)
      this.value_local.map((_, key: string) => {
        if (this.value_local == null || this.value_server == null) {
          // to satisfy typescript.
          return;
        }
        if (x[key] != null) {
          // update value we have locally
          if (this.handle_new_val(x[key], changed_keys)) {
            conflict = true;
          }
        } else {
          // This is a value defined locally that does not exist
          // on the remote serve.   It could be that the value
          // was deleted when we weren't connected, in which case
          // we should delete the value we have locally.  On the
          // other hand, maybe the local value was newly set
          // while we weren't connected, so we know it but the
          // backend server doesn't, which case we should keep it,
          // and set conflict=true, so it gets saved to the backend.

          if (this.value_local.get(key).equals(this.value_server.get(key))) {
            // The local value for this key was saved to the backend before
            // we got disconnected, so there's definitely no need to try
            // keep it around, given that the backend no longer has it
            // as part of the query.  CRITICAL: This doesn't necessarily mean
            // the value was deleted from the database, but instead that
            // it doesn't satisfy the synctable query, e.g., it isn't one
            // of the 150 most recent file_use notifications, or it isn't
            // a patch that is at least as new as the newest snapshot.
            //console.log("removing local value: #{key}")
            this.value_local = this.value_local.delete(key);
            changed_keys.push(key);
          } else {
            conflict = true;
          }
        }
      });

      // NEWLY ADDED:
      // Next check through each key in what's on the remote database,
      // and if the corresponding local key isn't defined, set its value.
      // Here we are simply checking for newly added records.
      for (let key in x) {
        const val = x[key];
        if (this.value_local.get(key) == null) {
          this.value_local = this.value_local.set(key, fromJS(val));
          changed_keys.push(key);
        }
      }
    }

    // It's possibly that nothing changed (e.g., typical case on reconnect!) so we check.
    // If something really did change, we set the server state to what we just got, and
    // also inform listeners of which records changed (by giving keys).
    //console.log("update_all: changed_keys=", changed_keys)
    if (changed_keys.length !== 0) {
      this.value_server = fromJS(x);
      this.emit_change(changed_keys);
    } else if (first_connect) {
      // First connection and table is empty.
      this.emit_change(changed_keys);
    }
    if (conflict) {
      this.save();
    }
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

  private handle_new_val(val: any, changed_keys: string[]): boolean {
    if (this.value_local == null || this.value_server == null) {
      // to satisfy typescript.
      return false;
    }
    const key = this.obj_to_key(val);
    if (key == null) {
      return false;
    }
    const new_val = fromJS(val);
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
        new_val.map((v, k) => {
          if (!immutable_is(v, server != null ? server.get(k) : undefined)) {
            return (local_val = local_val.set(k, v));
          }
        });
        //console.log("#{this.table}: set #{k} to #{v}")
        if (server != null) {
          server.map((_, k) => {
            if (!new_val.has(k)) {
              return (local_val = local_val.delete(k));
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
