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

import Bottleneck from "bottleneck";

const misc = require("smc-util/misc");
const { defaults } = misc;
const { required } = defaults;

// 0 to 9, smaller number is higher priority, 5 default, 6 for user queries
export const DEFAULT_USER_QUERY_PRIORITY = 6;

// We do at most this many user queries **at once** to the database on behalf
// of each connected client.
const USER_QUERY_LIMIT = 10;

// If we don't even start query by this long after we receive query, then we consider it failed
const USER_QUERY_TIMEOUT_MS = 15000;

// How many recent query times to save for each client.
// This is currently not used for anything except logging.
const TIME_HISTORY_LENGTH = 100;

// Maximum queue size -- if user tries to do more queries than this
// at once, then all old ones return an error.  They could then retry.
const MAX_QUEUE_SIZE = 50; // client isn't supposed to send more than around 25-50 at once.

// setup metrics
const metrics_recorder = require("./metrics-recorder");

const query_queue_exec = metrics_recorder.new_counter(
  "query_queue_executed_total",
  "Executed queries and their status",
  ["status"]
);

const LIMITER_STATS = metrics_recorder.new_gauge(
  "bottleneck_user_query_stats",
  "Bottleneck's internal counter stats for user queries (sum of all queues!)",
  ["stats"]
);

const LIMITER_NUMBER = metrics_recorder.new_gauge(
  "bottleneck_user_query_queues",
  "Number of bottleneck queues in user queries"
);

interface Stats {
  ts: number; // timestamp
  num_groups: number;
}

// for each client we keep track about what's going on
interface State {
  client_id: string;
  time_ms: number[]; // how long recent queries took in ms times_ms[times_ms.length-1] is most recent
}

const COUNT_SUM_INIT = {
  RECEIVED: 0,
  QUEUED: 0,
  RUNNING: 0,
  EXECUTING: 0,
  DONE: 0,
} as const;

// this is used only once, i.e. as if it is a singleton
export class UserQueryQueue {
  private readonly _do_query: Function;
  private readonly _dbg: Function;
  private readonly _timeout_ms: number;
  private readonly limiter: Bottleneck.Group;
  private stats?: Stats;
  private readonly timings: number[] = [];
  private readonly _states: { [key: string]: State } = {};
  private count_sum = { ...COUNT_SUM_INIT };

  constructor(opts) {
    this._do_one_query = this._do_one_query.bind(this);
    opts = defaults(opts, {
      do_query: required,
      dbg: required,
      limit: USER_QUERY_LIMIT,
      timeout_ms: USER_QUERY_TIMEOUT_MS,
      concurrent: required,
    });
    this._do_query = opts.do_query;
    this._dbg = opts.dbg;
    this._timeout_ms = opts.timeout_ms;

    this.limiter = new Bottleneck.Group({
      minTime: 10,
      maxConcurrent: USER_QUERY_LIMIT,
      highWater: MAX_QUEUE_SIZE,
      strategy: Bottleneck.strategy.OVERFLOW_PRIORITY,
      trackDoneStatus: true, // then counts().DONE is updated
    });

    this.update_stats();
  }

  public cancel_user_queries(opts: { client_id: string }): void {
    const { client_id } = opts;
    const l = this.limiter.key(client_id).queued();
    const msg = `cancel_user_queries(client_id='${opts.client_id}') -- discarding ${l}`;
    this._dbg(msg);
    this.limiter.deleteKey(client_id);
  }

  public user_query(opts): void {
    opts = defaults(opts, {
      client_id: required,
      priority: DEFAULT_USER_QUERY_PRIORITY,
      account_id: undefined,
      project_id: undefined,
      query: required,
      options: [],
      changes: undefined,
      cb: undefined,
    });
    const { client_id } = opts;
    this._dbg(`user_query(client_id='${client_id}')`);
    if (this._states[client_id] == null) {
      this._states[client_id] = {
        client_id,
        time_ms: [],
      };
    }
    opts.time = new Date();
    const limiteropts = {
      expiration: USER_QUERY_TIMEOUT_MS, // also a safeguard against never calling the cb()
      priority: opts.priority,
    };
    delete opts.priority;
    const cb = opts.cb;
    delete opts.cb;

    this.limiter
      .key(client_id)
      .submit(limiteropts, this._do_one_query, opts, cb);
    this.update_stats();
    this.info(this._states[client_id]);
  }

  // actually doing the query (another bottleneck limiter is waiting ...)
  // note: this method is bound, see constructor
  private _do_one_query(opts, main_cb): void {
    if (new Date().getTime() - opts.time.getTime() >= this._timeout_ms) {
      this._dbg("_do_one_query -- timed out");
      // It took too long before we even **started** the query.  There is no
      // point in even trying; the client likely already gave up.
      main_cb?.("timeout in user-query-queue");
      query_queue_exec.labels("timeout").inc(1);
      return;
    }

    const id = misc.uuid().slice(0, 6);
    const tm = new Date();
    const { client_id } = opts;
    delete opts.client_id;
    this._dbg(
      `_do_one_query(client_id='${client_id}', query_id='${id}') -- doing the query`
    );
    // Remove the two properties from opts that @_do_query doesn't take
    // as inputs, and of course we do not need anymore.
    delete opts.time; // no longer matters

    // Set a cb that calls our cb exactly once, but sends anything
    // it receives to the orig_cb, if there is one.
    opts.cb = (err, result) => {
      if (main_cb != null) {
        const dt = new Date().getTime() - tm.getTime();
        this._dbg(
          `_do_one_query(client_id='${client_id}', query_id='${id}') -- done; time=${dt}ms`
        );
        main_cb(err, result);
        const state = this._states[client_id];
        state.time_ms.push(dt);
        while (state.time_ms.length > TIME_HISTORY_LENGTH) {
          state.time_ms.shift();
        }
        this.info(state);
        this.update_stats(dt);
      }
    };

    // Increment counters
    query_queue_exec.labels("sent").inc(1);
    // Finally, do the query.
    this._do_query(opts);
  }

  // compute some stats
  private update_stats(timing?: number): void {
    if (timing != null) {
      this.timings.push(timing);
      while (this.timings.length > TIME_HISTORY_LENGTH) {
        this.timings.shift();
      }
    }
    const ts = new Date().getTime();
    // only update every 10 secs or more
    if (this.stats != null && ts - this.stats.ts <= 1 * 1000) return;
    const count_sum = COUNT_SUM_INIT;
    let num_groups = 0;
    for (const group of this.limiter.limiters()) {
      num_groups += 1;
      for (const [k, v] of Object.entries(group.limiter.counts())) {
        if (count_sum[k] != null) count_sum[k] += v;
      }
    }

    // record the new summary stats
    Object.assign(this.count_sum, count_sum);

    // ... and tell prometheus about it
    LIMITER_NUMBER.set(num_groups);
    Object.entries(count_sum).forEach(([k, v]) =>
      LIMITER_STATS.labels(k).set(v)
    );

    this.stats = { ts, num_groups };
  }

  // number of queries currently outstanding (waiting for these to finish)
  private global_count(): number {
    return this.count_sum.QUEUED;
  }

  private _avg(state: State): number {
    // recent average time
    const v = state.time_ms.slice(state.time_ms.length - 10);
    if (v.length === 0) return 0;
    const s = v.reduce((a, b) => a + b, 0);
    return s / v.length;
  }

  private info(state): void {
    const avg = this._avg(state);
    const ls = this.limiter.key(state.client_id).counts();
    const global = `global=${this.global_count()}`;
    const counts = `count(run=${ls.RUNNING + ls.EXECUTING}, ${global})`;
    const queued = `queued.length=${ls.QUEUED}`;
    // this._dbg(`global queue: ${JSON.stringify(this.count_sum)}`);
    this._dbg(
      `client_id='${state.client_id}': avg=${avg}ms, ${counts}, ${queued}, sent=${state.sent}`
    );
  }
}
