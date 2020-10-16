//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

/*
User query queue.

The point of this is to make it so:
 (1) there is a limit on the number of simultaneous queries that a single connected client
     can make to the database, and
 (2) when the client disconnects, any outstanding (not started) queries are cancelled, and
 (3) queries that don't even start until a certain amount of time after they were made are
     automatically considered to have failed (so the client retries).
*/

const misc = require("smc-util/misc");
const { defaults } = misc;
const { required } = defaults;

// We do at most this many user queries **at once** to the database on behalf
// of each connected client.  This only applies when the global limit has
// been exceeded.
const USER_QUERY_LIMIT = 10;

// If we don't even start query by this long after we receive query, then we consider it failed
const USER_QUERY_TIMEOUT_MS = 15000;

// How many recent query times to save for each client.
// This is currently not used for anything except logging.
const TIME_HISTORY_LENGTH = 100;

// Do not throttle queries at all unless there are at least this
// many global outstanding concurrent **user queries**.  The point is that
// if there's very little load, we should get queries done as fast
// as possible for users.
const GLOBAL_LIMIT = 250;

// Maximum queue size -- if user tries to do more queries than this
// at once, then all old ones return an error.  They could then retry.
const MAX_QUEUE_SIZE = 150; // client isn't supposed to send more than around 25-50 at once.

// setup metrics
const metrics_recorder = require("./metrics-recorder");

const query_queue_exec = metrics_recorder.new_counter(
  "query_queue_executed_total",
  "Executed queries and their status",
  ["status"]
);
const query_queue_duration = metrics_recorder.new_counter(
  "query_queue_duration_seconds_total",
  "Total time it took to evaluate queries"
);
const query_queue_done = metrics_recorder.new_counter(
  "query_queue_done_total",
  "Total number of evaluated queries"
);
//query_queue_info = metrics_recorder.new_gauge('query_queue_info', 'Information update about outstanding queries in the queue', ['client', 'info'])

let global_count = 0;

export class UserQueryQueue {
  private readonly _do_query: Function;
  private readonly _limit: number;
  private readonly _dbg: Function;
  private readonly _timeout_ms: number;
  private readonly _global_limit: number;
  private readonly _concurrent: () => number;
  private readonly _state: any = {};

  constructor(opts) {
    this.cancel_user_queries = this.cancel_user_queries.bind(this);
    this.user_query = this.user_query.bind(this);
    this._do_one_query = this._do_one_query.bind(this);
    this._update = this._update.bind(this);
    this._discard_next_call = this._discard_next_call.bind(this);
    this._process_next_call = this._process_next_call.bind(this);
    this._avg = this._avg.bind(this);
    this._info = this._info.bind(this);
    opts = defaults(opts, {
      do_query: required,
      dbg: required,
      limit: USER_QUERY_LIMIT,
      timeout_ms: USER_QUERY_TIMEOUT_MS,
      global_limit: GLOBAL_LIMIT,
      concurrent: required,
    });
    this._do_query = opts.do_query;
    this._limit = opts.limit;
    this._dbg = opts.dbg;
    this._timeout_ms = opts.timeout_ms;
    this._global_limit = opts.global_limit;
    this._state = {};
    this._concurrent = opts.concurrent;
  }

  public cancel_user_queries(opts): void {
    opts = defaults(opts, { client_id: required });
    const state = this._state[opts.client_id];
    const l = state?.queue?.length;
    const msg = `cancel_user_queries(client_id='${opts.client_id}') -- discarding ${l}`;
    this._dbg(msg);
    if (state != null) {
      delete state.queue; // so we will stop trying to do queries for this client
      delete this._state[opts.client_id]; // and won't waste memory on them
    }
  }

  public user_query(opts): void {
    opts = defaults(opts, {
      client_id: required,
      priority: undefined, // (NOT IMPLEMENTED) priority for this query
      // (an integer [-10,...,19] like in UNIX)
      account_id: undefined,
      project_id: undefined,
      query: required,
      options: [],
      changes: undefined,
      cb: undefined,
    });
    const { client_id } = opts;
    this._dbg(`user_query(client_id='${client_id}')`);
    let state = this._state[client_id];
    if (state == null) {
      state = this._state[client_id] = {
        client_id,
        queue: [], // queries in the queue
        count: 0, // number of queries currently outstanding (waiting for these to finish)
        sent: 0, // total number of queries sent to database
        time_ms: [], // how long recent queries took in ms times_ms[times_ms.length-1] is most recent
      };
    }
    opts.time = new Date();
    state.queue.push(opts);
    state.sent += 1;
    this._update(state);
  }

  private _do_one_query(opts, cb): void {
    if (new Date().getTime() - opts.time.getTime() >= this._timeout_ms) {
      this._dbg("_do_one_query -- timed out");
      // It took too long before we even **started** the query.  There is no
      // point in even trying; the client likely already gave up.
      opts.cb?.("timeout");
      cb();
      query_queue_exec.labels("timeout").inc();
      return;
    }

    const id = misc.uuid().slice(0, 6);
    const tm = new Date();
    const { client_id } = opts;
    this._dbg(
      `_do_one_query(client_id='${client_id}', query_id='${id}') -- doing the query`
    );
    // Actually do the query
    const orig_cb = opts.cb;
    // Remove the two properties from opts that @_do_query doesn't take
    // as inputs, and of course we do not need anymore.
    delete opts.time; // no longer matters
    delete opts.client_id;
    delete opts.priority;

    // Set a cb that calls our cb exactly once, but sends anything
    // it receives to the orig_cb, if there is one.
    opts.cb = (err, result) => {
      if (cb != null) {
        this._dbg(
          `_do_one_query(client_id='${client_id}', query_id='${id}') -- done; time=${
            new Date().getTime() - tm.getTime()
          }ms`
        );
        cb();
        cb = undefined;
      }
      if (result?.action === "close" || err) {
        // I think this is necessary for this closure to ever
        // get garbage collected.  **Not tested, and this could be bad.**
        delete opts.cb;
      }
      orig_cb?.(err, result);
    };

    // Increment counter
    query_queue_exec.labels("sent").inc();
    // Finally, do the query.
    this._do_query(opts);
  }

  private _update(state): void {
    if (state.queue == null || state.queue.length === 0) {
      return;
    }
    // Discard all additional messages beyond outstanding and in queue.  The client is
    // assumed to be smart enough to try again.
    while (state.queue.length + state.count > MAX_QUEUE_SIZE) {
      this._discard_next_call(state);
    }
    // Now handle the remaining messages up to the limit.
    while (
      state.queue.length > 0 &&
      (this._concurrent() < this._global_limit || state.count < this._limit)
    ) {
      this._process_next_call(state);
    }
  }

  private _discard_next_call(state): void {
    if (state.queue == null || state.queue.length === 0) {
      return;
    }
    this._dbg(
      `_discard_next_call -- discarding (queue size=${state.queue.length})`
    );
    const opts = state.queue.shift();
    opts.cb("discarded");
    this._info(state);
  }

  private _process_next_call(state): void {
    if (state.queue == null || state.queue.length === 0) {
      return;
    }
    state.count += 1;
    global_count += 1;
    const opts = state.queue.shift();
    this._info(state);
    const tm = new Date();
    return this._do_one_query(opts, () => {
      state.count -= 1;
      global_count -= 1;
      const duration_ms = new Date().getTime() - tm.getTime();
      state.time_ms.push(duration_ms);
      query_queue_duration.inc(duration_ms / 1000);
      query_queue_done.inc(1);
      while (state.time_ms.length > TIME_HISTORY_LENGTH) {
        state.time_ms.shift();
      }
      this._info(state);
      this._update(state);
    });
  }

  private _avg(state): number {
    // recent average time
    const v = state.time_ms.slice(state.time_ms.length - 10);
    if (v.length === 0) {
      return 0;
    }
    let s = 0;
    for (let a of v) {
      s += a;
    }
    return s / v.length;
  }

  private _info(state): void {
    const avg = this._avg(state);
    //query_queue_info.labels(state.client_id, 'count').set(state.count)
    //query_queue_info.labels(state.client_id, 'avg').set(avg)
    //query_queue_info.labels(state.client_id, 'length').set(state.queue?.length ? 0)
    //query_queue_info.labels(state.client_id, 'sent').set(state.sent)
    this._dbg(
      `client_id='${state.client_id}': avg=${avg}ms, count(local=${state.count},global=${global_count}), queued.length=${state.queue?.length}, sent=${state.sent}`
    );
  }
}
