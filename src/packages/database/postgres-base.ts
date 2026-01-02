/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// PostgreSQL -- basic queries and database interface

// Node.js built-in modules
import { EventEmitter } from "events";

// Third-party modules
import LRU from "lru-cache";

// CoCalc utility modules
import { bind_methods } from "@cocalc/util/misc";
import { callback2 } from "@cocalc/util/async-utils";
import { SCHEMA } from "@cocalc/util/schema";
import { pghost, pgdatabase, pguser, pgssl } from "@cocalc/backend/data";
import dbPassword from "@cocalc/database/pool/password";

// Schema modules
import { syncSchema } from "./postgres/schema";
import { primaryKey, primaryKeys } from "./postgres/schema/table";

// Utility functions
import { count_result } from "./postgres/utils/count-result";

// Group 1: Database Utilities - TypeScript implementations
import * as UtilTS from "./postgres/core/util";

// Group 2: Schema & Metadata - TypeScript implementations
import { getTables, getColumns } from "./postgres/schema/introspection";

// Group 3: Throttling & Delete Operations - TypeScript implementations
import { throttle, clearThrottles } from "./postgres/core/throttle";
import {
  deleteExpired,
  deleteAll,
  deleteEntireDatabase,
} from "./postgres/core/delete";

// Group 4: Test Query & Health Monitoring - TypeScript implementations
import {
  doTestQuery,
  initTestQuery,
  closeTestQuery,
} from "./postgres/core/health";

// Group 5: Connection Management - TypeScript implementations
import {
  connect as connectTS,
  disconnect as disconnectTS,
  isConnected as isConnectedTS,
  getClient as getClientTS,
  closeDatabase,
} from "./postgres/core/connect";
import { connectDo } from "./postgres/core/connect-do";

// Group 6: Query Engine - TypeScript implementations
import { doQuery } from "./postgres/core/query-do";
import { query } from "./postgres/core/query";
import { queryRetryUntilSuccess } from "./postgres/core/query-retry";
import { validateOpts } from "./postgres/core/query-validate";
import { count as countQuery } from "./postgres/core/query-count";

// Constants

const defaultExport: any = {};
defaultExport.DEBUG = true;

// If database connection is non-responsive but no error raised directly
// by db client, then we will know and fix, rather than just sitting there...
const DEFAULT_TIMEOUS_MS = 60000;

// Do not test for non-responsiveness until a while after initial connection
// established, since things tend to work initially, *but* may also be much
// slower, due to tons of clients simultaneously connecting to DB.
const DEFAULT_TIMEOUT_DELAY_MS = DEFAULT_TIMEOUS_MS * 4;

defaultExport.PostgreSQL = class PostgreSQL extends EventEmitter {
  // Connection configuration
  _database!: string;
  _host!: string;
  _port!: number;
  _password!: string;
  _ssl: any;
  _user!: string;

  // State management
  _state!: string;
  _debug?: boolean;
  _timeout_ms?: number;
  _timeout_delay_ms?: number;
  _ensure_exists?: boolean;

  // Client management
  _clients?: any[];
  _client_index?: number;
  _connecting?: any[];
  _connect_time?: any;

  // Query management
  _concurrent_queries?: number;
  _concurrent_warn!: number;
  _concurrent_heavily_loaded!: number;
  _query_cache?: any;

  // Monitoring
  _test_query?: any;
  _stats_cached?: any;
  query_time_histogram?: any;
  concurrent_counter?: any;

  // Notification
  _notification?: Function;
  _listening?: Record<string, number>;

  // Status
  is_standby!: boolean;

  // emits a 'connect' event whenever we successfully connect to the database and 'disconnect' when connection to postgres fails
  constructor(opts) {
    super(); // Must call super() first before accessing 'this'
    bind_methods(this); // Bind all methods to this instance to preserve 'this' context in callbacks
    const {
      host,
      database,
      user,
      ssl,
      debug,
      connect,
      password,
      cache_expiry,
      cache_size,
      concurrent_warn,
      concurrent_heavily_loaded,
      ensure_exists,
      timeout_ms,
      timeout_delay_ms,
    } = opts ?? {};
    const resolvedHost = host ?? pghost;
    const resolvedDatabase = database ?? pgdatabase;
    const resolvedUser = user ?? pguser;
    const resolvedSsl = ssl ?? pgssl;
    const resolvedDebug = debug ?? defaultExport.DEBUG;
    const resolvedConnect = connect ?? true;
    const resolvedCacheExpiry = cache_expiry ?? 5000;
    const resolvedCacheSize = cache_size ?? 300;
    const resolvedConcurrentWarn = concurrent_warn ?? 500;
    const resolvedConcurrentHeavilyLoaded = concurrent_heavily_loaded ?? 70;
    const resolvedEnsureExists = ensure_exists ?? true;
    const resolvedTimeoutMs = timeout_ms ?? DEFAULT_TIMEOUS_MS;
    const resolvedTimeoutDelayMs = timeout_delay_ms ?? DEFAULT_TIMEOUT_DELAY_MS;
    const resolvedPassword = password ?? dbPassword();
    const resolvedOpts = {
      host: resolvedHost,
      database: resolvedDatabase,
      user: resolvedUser,
      ssl: resolvedSsl,
      debug: resolvedDebug,
      connect: resolvedConnect,
      password: resolvedPassword,
      cache_expiry: resolvedCacheExpiry,
      cache_size: resolvedCacheSize,
      concurrent_warn: resolvedConcurrentWarn,
      concurrent_heavily_loaded: resolvedConcurrentHeavilyLoaded,
      ensure_exists: resolvedEnsureExists,
      timeout_ms: resolvedTimeoutMs,
      timeout_delay_ms: resolvedTimeoutDelayMs,
    };
    this.setMaxListeners(0); // because of a potentially large number of changefeeds
    this._state = "init";
    this._debug = resolvedDebug;
    this._timeout_ms = resolvedTimeoutMs;
    this._timeout_delay_ms = resolvedTimeoutDelayMs;
    this._ensure_exists = resolvedEnsureExists;
    this._init_test_query();
    const dbg = this._dbg("constructor"); // must be after setting @_debug above
    dbg(resolvedOpts);
    const i = resolvedHost.indexOf(":");
    if (i !== -1) {
      this._host = resolvedHost.slice(0, i);
      this._port = parseInt(resolvedHost.slice(i + 1));
    } else {
      this._host = resolvedHost;
      this._port = 5432;
    }
    this._concurrent_warn = resolvedConcurrentWarn;
    this._concurrent_heavily_loaded = resolvedConcurrentHeavilyLoaded;
    this._user = resolvedUser;
    this._database = resolvedDatabase;
    this._ssl = resolvedSsl;
    this._password = resolvedPassword;
    this._init_metrics();

    if (resolvedCacheExpiry && resolvedCacheSize) {
      this._query_cache = new LRU({
        max: resolvedCacheSize,
        ttl: resolvedCacheExpiry,
      });
    }
    if (resolvedConnect) {
      this.connect({}); // start trying to connect
    }
  }

  clear_cache() {
    return UtilTS.clearCache(this as any);
  }

  _clear_listening_state() {
    this._listening = {};
  }

  // Group 5: Connection Management - delegating to TypeScript
  close() {
    return closeDatabase(this as any);
  }

  /*
    If @_timeout_ms is set, then we periodically do a simple test query,
    to ensure that the database connection is working and responding to queries.
    If the query below times out, then the connection will get recreated.
    */
  // Group 4: Test Query & Health Monitoring - delegating to TypeScript
  _do_test_query() {
    return doTestQuery(this as any);
  }

  _init_test_query() {
    return initTestQuery(this as any);
  }

  _close_test_query() {
    return closeTestQuery(this as any);
  }

  engine() {
    return UtilTS.engine();
  }

  connect(opts) {
    return connectTS(this as any, opts);
  }

  disconnect() {
    return disconnectTS(this as any);
  }

  is_connected() {
    return isConnectedTS(this as any);
  }

  async _connect(cb) {
    return connectDo(this as any, cb);
  }

  // Return a native pg client connection.  This will
  // round robbin through all connections.  It returns
  // undefined if there are no connections.
  _client() {
    return getClientTS(this as any);
  }

  // Return query function of a database connection.
  get_db_query() {
    const db = this._client();
    return db != null ? db.query.bind(db) : undefined;
  }

  _dbg(f) {
    return UtilTS.dbg(this as any, f);
  }

  _init_metrics() {
    return UtilTS.initMetrics(this as any);
  }

  async async_query(opts) {
    return await callback2(this._query.bind(this), opts);
  }

  _query(opts) {
    return query(this as any, opts);
  }

  _query_retry_until_success(opts) {
    return queryRetryUntilSuccess(this as any, opts);
  }

  __do_query(opts) {
    return doQuery(this as any, opts);
  }

  // Group 6: Query Engine - delegating to TypeScript implementations
  _count(opts) {
    return countQuery(this as any, opts);
  }

  _validate_opts(opts) {
    return validateOpts(this as any, opts);
  }

  _ensure_database_exists(cb) {
    return UtilTS.ensureDatabaseExists(this as any, cb);
  }

  _confirm_delete(opts) {
    const { confirm = "no", cb } = opts ?? {};
    const dbg = this._dbg("confirm");
    if (confirm !== "yes") {
      const err = `Really delete all data? -- you must explicitly pass in confirm='yes' (but confirm:'${confirm}')`;
      dbg(err);
      cb?.(err);
      return false;
    } else {
      return true;
    }
  }

  set_random_password(_opts) {
    throw Error("NotImplementedError");
  }

  // This will fail if any other clients have db open.
  // This function is very important for automated testing.
  delete_entire_database(opts) {
    return deleteEntireDatabase(this as any, opts);
  }

  // Deletes all the contents of the tables in the database.  It doesn't
  // delete anything about the schema itself: indexes or tables.
  delete_all(opts) {
    return deleteAll(this as any, opts);
  }

  // return list of tables in the database
  // Group 2: Schema & Metadata - delegating to TypeScript
  _get_tables(cb) {
    return getTables(this as any, cb);
  }

  _get_columns(table, cb) {
    return getColumns(this as any, table, cb);
  }

  _primary_keys(table) {
    return primaryKeys(table);
  }

  _primary_key(table) {
    return primaryKey(table);
  }

  // Group 3: Throttling & Delete Operations - delegating to TypeScript
  _throttle(name, time_s, ...key) {
    return throttle(this as any, name, time_s, ...Array.from(key));
  }

  _clear_throttles() {
    return clearThrottles(this as any);
  }

  // Ensure that the actual schema in the database matches the one defined in SCHEMA.
  // This creates the initial schema, adds new columns, and in a VERY LIMITED
  // range of cases, *might be* be able to change the data type of a column.
  async update_schema(opts) {
    try {
      await syncSchema(SCHEMA);
      return typeof opts.cb === "function" ? opts.cb() : undefined;
    } catch (err) {
      return typeof opts.cb === "function" ? opts.cb(err) : undefined;
    }
  }

  // Return the number of outstanding concurrent queries.
  concurrent() {
    return UtilTS.concurrent(this as any);
  }

  is_heavily_loaded() {
    return UtilTS.isHeavilyLoaded(this as any);
  }

  // Compute the sha1 hash (in hex) of the input arguments, which are
  // converted to strings (via json) if they are not strings, then concatenated.
  // This is used for computing compound primary keys in a way that is relatively
  // safe, and in situations where if there were a highly unlikely collision, it
  // wouldn't be the end of the world.  There is a similar client-only slower version
  // of this function (in schema.coffee), so don't change it willy nilly.
  sha1(...args) {
    return UtilTS.sha1Hash(...Array.from(args || []));
  }

  // Go through every table in the schema with a column called "expire", and
  // delete every entry where expire is <= right now.
  // Note: this ignores those rows, where expire is NULL, because comparisons with NULL are NULL
  delete_expired(opts) {
    return deleteExpired(this as any, opts);
  }

  // count number of entries in a table
  count(opts) {
    const { table, cb } = opts ?? {};
    if (!table) {
      cb?.("table must be specified");
      return;
    }
    if (typeof cb !== "function") {
      throw new Error("count requires a callback");
    }
    return this._query({
      query: `SELECT COUNT(*) FROM ${table}`,
      cb: count_result(cb),
    });
  }

  // sanitize strings before inserting them into a query string
  sanitize(s) {
    return UtilTS.sanitize(s);
  }
};

// Export the PostgreSQL class
export const PostgreSQL = defaultExport.PostgreSQL;
