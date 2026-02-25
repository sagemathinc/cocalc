/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// SyncTable class - Real-time table synchronization with PostgreSQL LISTEN/NOTIFY
// Migrated from postgres-synctable.coffee

import { EventEmitter } from "events";
import async from "async";
import immutable from "immutable";

import * as misc from "@cocalc/util/misc";
import { SCHEMA } from "@cocalc/util/schema";
import type { CB } from "@cocalc/util/types/callback";

import type {
  PostgreSQL,
  QueryOptions,
  QueryWhere,
  SyncTableKey,
  SyncTableNotification,
  SyncTableRow,
  SyncTableWhereFunction,
} from "../postgres/types";

// Import utility functions from their modules
import { pg_type } from "../postgres/utils/pg-type";
import { quote_field } from "../postgres/utils/quote-field";

type SyncTableRowValue = immutable.Map<string, unknown>;
type SyncTableValue = immutable.Map<SyncTableKey, SyncTableRowValue>;

interface WaitOptions<T = unknown> {
  until: (table: SyncTable) => T;
  timeout?: number; // in seconds, 0 to disable
  cb: CB<T>;
}

/**
 * Server-side synchronized table using PostgreSQL LISTEN/NOTIFY
 * Automatically tracks changes to a table and maintains an in-memory cache
 */
export class SyncTable extends EventEmitter {
  private _db: PostgreSQL;
  private _table: string;
  private _columns?: string[];
  private _where?: QueryWhere;
  private _where_function?: SyncTableWhereFunction;
  private _limit?: number;
  private _order_by?: string;
  private _primary_key!: string;
  private _listen_columns!: Record<string, string>;
  private _watch_columns!: string[];
  private _select_columns!: string[];
  private _select_query!: string;
  private _state: "init" | "ready" | "error" | "closed" = "init";
  private _value?: SyncTableValue;
  private _changed: Record<SyncTableKey, boolean> = {};
  private _tgname?: string;

  constructor(
    _db: PostgreSQL,
    _table: string,
    _columns: string[] | undefined,
    _where: QueryWhere | undefined,
    _where_function: SyncTableWhereFunction | undefined,
    _limit: number | undefined,
    _order_by: string | undefined,
    cb?: CB<SyncTable>,
  ) {
    super();

    // Bind all methods automatically
    misc.bind_methods(this);

    this._db = _db;
    this._table = _table;
    this._columns = _columns;
    this._where = _where;
    this._where_function = _where_function;
    this._limit = _limit;
    this._order_by = _order_by;

    const t = SCHEMA[this._table];
    if (t == null) {
      this._state = "error";
      cb?.(`unknown table ${this._table}`);
      return;
    }

    try {
      this._primary_key = this._db._primary_key(this._table);
    } catch (e) {
      cb?.(e);
      return;
    }

    this._listen_columns = {
      [this._primary_key]: pg_type(t.fields[this._primary_key]),
    };

    // We only trigger an update when one of the columns we care about actually changes.
    if (this._columns) {
      this._watch_columns = misc.copy(this._columns); // don't include primary key since it can't change.
      if (!this._columns.includes(this._primary_key)) {
        this._columns = this._columns.concat([this._primary_key]); // required
      }
      this._select_columns = this._columns;
    } else {
      this._watch_columns = []; // means all of them
      this._select_columns = misc.keys(SCHEMA[this._table].fields);
    }

    this._select_query = `SELECT ${this._select_columns.map((x) => quote_field(x)).join(", ")} FROM ${this._table}`;

    this._init((err) => {
      if (err && cb == null) {
        this.emit("error", err);
        return;
      }
      this.emit("init");
      cb?.(err, this);
    });
  }

  _dbg(f: string) {
    return this._db._dbg(`SyncTable(table='${this._table}').${f}`);
  }

  _query_opts(): QueryOptions<SyncTableRow> {
    const opts: QueryOptions<SyncTableRow> = {};
    opts.query = this._select_query;
    opts.where = this._where;
    opts.limit = this._limit;
    opts.order_by = this._order_by;
    return opts;
  }

  close(cb?: CB) {
    this.removeAllListeners();
    if (this._tgname) {
      this._db.removeListener(this._tgname, this._notification);
    }
    this._db.removeListener("connect", this._reconnect);
    this._state = "closed";
    delete this._value;
    this._db._stop_listening(
      this._table,
      this._listen_columns,
      this._watch_columns,
      cb,
    );
  }

  connect(opts?: { cb?: CB }) {
    opts?.cb?.(); // NO-OP -- only needed for backward compatibility
  }

  _notification(obj: SyncTableNotification) {
    const [action, new_val, old_val] = obj;
    if (action === "DELETE" || new_val == null) {
      const k = (old_val as SyncTableRow)[this._primary_key] as SyncTableKey;
      if (this._value?.has(k)) {
        this._value = this._value.delete(k);
        process.nextTick(() => this.emit("change", k));
      }
    } else {
      const k = new_val[this._primary_key] as SyncTableKey;
      if (this._where_function != null && !this._where_function(k)) {
        // doesn't match -- nothing to do -- ignore
        return;
      }
      this._changed[k] = true;
      this._update();
    }
  }

  _init(cb: CB) {
    misc.retry_until_success({
      f: this._do_init,
      start_delay: 3000,
      max_delay: 10000,
      log: this._dbg("_init"),
      cb,
    });
  }

  _do_init(cb: CB) {
    this._state = "init"; // 'init' -> ['error', 'ready'] -> 'closed'
    this._value = immutable.Map<SyncTableKey, SyncTableRowValue>();
    this._changed = {};
    async.series(
      [
        (cb) => {
          // ensure database client is listening for primary keys changes to our table
          this._db._listen(
            this._table,
            this._listen_columns,
            this._watch_columns,
            (err, tgname) => {
              if (err) {
                cb(err);
                return;
              }
              if (!tgname) {
                cb("missing trigger name");
                return;
              }
              this._tgname = tgname;
              this._db.on(this._tgname, this._notification);
              cb();
            },
          );
        },
        (cb) => {
          const opts = this._query_opts();
          opts.cb = (err, result) => {
            if (err) {
              cb(err);
            } else {
              if (!result) {
                cb("missing query result");
                return;
              }
              this._process_results(result.rows);
              this._db.once("connect", this._reconnect);
              cb();
            }
          };
          this._db._query(opts);
        },
        (cb) => {
          this._update(cb);
        },
      ],
      (err) => {
        if (err) {
          this._state = "error";
          cb(err);
        } else {
          this._state = "ready";
          cb();
        }
      },
    );
  }

  _reconnect(cb?: CB) {
    const dbg = this._dbg("_reconnect");
    if (this._state !== "ready") {
      dbg(
        "only attempt reconnect if we were already successfully connected at some point.",
      );
      return;
    }
    // Everything was already initialized, but then the connection to the
    // database was dropped... and then successfully re-connected.  Now
    // we need to (1) setup everything again, and (2) send out notifications
    // about anything in the table that changed.

    dbg("Save state from before disconnect");
    const before = this._value;

    dbg("Clean up everything.");
    if (this._tgname) {
      this._db.removeListener(this._tgname, this._notification);
    }
    this._db.removeListener("connect", this._reconnect);
    delete this._value;

    dbg("connect and initialize");
    this._init((err) => {
      if (err) {
        cb?.(err);
        return;
      }
      if (this._value != null && before != null) {
        // It's highly unlikely that before or this._value would not be defined, but it could happen (see #2527)
        dbg("notify about anything that changed when we were disconnected");
        before.map((v, k) => {
          if (!v.equals(this._value!.get(k))) {
            this.emit("change", k);
          }
        });
        this._value.map((_v, k) => {
          if (!before.has(k)) {
            this.emit("change", k);
          }
        });
      }
      cb?.();
    });
  }

  _process_results(rows: SyncTableRow[]) {
    if (this._state === "closed" || this._value == null) {
      // See https://github.com/sagemathinc/cocalc/issues/4440
      // for why the this._value check.  Remove this when this is
      // rewritten in typescript and we can guarantee stuff.
      return;
    }
    for (const x of rows) {
      const k = x[this._primary_key] as SyncTableKey;
      const v = immutable.fromJS(
        misc.map_without_undefined_and_null(x),
      ) as SyncTableRowValue;
      const existing = this._value.get(k);
      if (!existing || !v.equals(existing)) {
        this._value = this._value.set(k, v);
        if (this._state === "ready") {
          // only send out change notifications after ready.
          process.nextTick(() => this.emit("change", k));
        }
      }
    }
  }

  // Remove from synctable anything that no longer matches the where criterion.
  _process_deleted(
    rows: SyncTableRow[],
    changed: Record<SyncTableKey, boolean>,
  ) {
    const kept: Record<SyncTableKey, boolean> = {};
    for (const x of rows) {
      kept[x[this._primary_key] as SyncTableKey] = true;
    }
    for (const k in changed) {
      if (!kept[k] && this._value?.has(k)) {
        // The record with primary_key k no longer matches the where criterion
        // so we delete it from our synctable.
        this._value = this._value.delete(k);
        if (this._state === "ready") {
          process.nextTick(() => this.emit("change", k));
        }
      }
    }
  }

  // Grab any entries from table about which we have been notified of changes.
  _update(cb?: CB) {
    if (misc.len(this._changed) === 0) {
      // nothing to do
      cb?.();
      return;
    }
    const changed = this._changed;
    this._changed = {}; // reset changed set -- could get modified during query below, which is fine.
    if (this._select_columns.length === 1) {
      // special case where we don't have to query for more info
      this._process_results(
        misc.keys(changed).map((x) => ({ [this._primary_key]: x })),
      );
      cb?.();
      return;
    }

    // Have to query to get actual changed data.
    const where: QueryWhere =
      this._where == null
        ? { [`${this._primary_key} = ANY($)`]: misc.keys(changed) }
        : [
            { [`${this._primary_key} = ANY($)`]: misc.keys(changed) },
            this._where,
          ];
    this._db._query({
      query: this._select_query,
      where,
      cb: (err, result) => {
        if (err) {
          this._dbg("update")(`error ${err}`);
          for (const k in changed) {
            this._changed[k] = true; // will try again later
          }
        } else {
          if (!result) {
            this._dbg("update")("missing query result");
            cb?.();
            return;
          }
          this._process_results(result.rows);
          this._process_deleted(result.rows, changed);
        }
        cb?.();
      },
    });
  }

  get(
    key?: SyncTableKey | SyncTableKey[],
  ): SyncTableValue | SyncTableRowValue | undefined {
    // key = single key or array of keys
    if (key == null || this._value == null) {
      return this._value;
    }
    if (misc.is_array(key)) {
      // for consistency with @cocalc/sync/synctable
      let r: SyncTableValue = immutable.Map<SyncTableKey, SyncTableRowValue>();
      for (const k of key) {
        const v = this._value.get(k);
        if (v != null) {
          r = r.set(k, v);
        }
      }
      return r;
    } else {
      return this._value.get(key);
    }
  }

  getIn(path: Array<string | number>): unknown {
    return this._value?.getIn(path);
  }

  has(key: SyncTableKey): boolean | undefined {
    return this._value?.has(key);
  }

  // wait until some function of this synctable is truthy
  wait(opts: WaitOptions) {
    const options = misc.defaults(opts, {
      until: misc.required,
      timeout: 30, // in *seconds* -- set to 0 to disable (sort of DANGEROUS if 0, obviously.)
      cb: misc.required,
    });

    let x = options.until(this);
    if (x) {
      options.cb(undefined, x); // already true
      return;
    }
    let fail_timer: NodeJS.Timeout | undefined = undefined;
    const f = () => {
      x = options.until(this);
      if (x) {
        this.removeListener("change", f);
        if (fail_timer != null) {
          clearTimeout(fail_timer);
          fail_timer = undefined;
        }
        options.cb(undefined, x);
      }
    };
    this.on("change", f);
    if (options.timeout) {
      const fail = () => {
        this.removeListener("change", f);
        options.cb("timeout");
      };
      fail_timer = setTimeout(fail, 1000 * options.timeout);
    }
  }
}
