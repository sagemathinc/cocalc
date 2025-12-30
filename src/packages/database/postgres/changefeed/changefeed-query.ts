/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Does the queries to update changefeeds, deduplicating across
both all changefeeds and a small interval of time.
*/

// set to false to completely disable for debugging/testing
const THROTTLE: boolean = true;

// 10ms when running unit tests, still throttle, but make it quick.
// Otherwise, we default to 500ms, which is enough to be massively
// useful, but also not noticed by user.
let THROTTLE_MS: number = process.env.SMC_TEST ? 10 : 500;

// THROTTLE_MS can be overridden the POSTGRES_THROTTLE_CHANGEFEED_MS
// environment variable.
if (process.env.POSTGRES_THROTTLE_CHANGEFEED_MS != null) {
  THROTTLE_MS = parseInt(process.env.POSTGRES_THROTTLE_CHANGEFEED_MS);
}

import { EventEmitter } from "events";

import { callback } from "awaiting";

import { once } from "@cocalc/util/async-utils";
import { close, copy } from "@cocalc/util/misc";

const { one_result, all_results } = require("../../postgres-base");

import { PostgreSQL, QueryWhere } from "../types";

interface QueryOpts {
  db: PostgreSQL;
  select: string[];
  table: string;
  where: QueryWhere;
  one: boolean;
}

interface TableQuery {
  select: string[];
  where: QueryWhere;
}

function key(obj: { [key: string]: any }): string {
  return `query-${JSON.stringify(obj)}`;
}

type State = "ready" | "closed";

class ThrottledTableQueue extends EventEmitter {
  private table: string;
  private queue: { [key: string]: TableQuery } = {};
  private db: PostgreSQL;
  private process_timer: any;
  private interval_ms: number;
  private state: State = "ready";

  constructor(db: PostgreSQL, table: string, interval_ms: number) {
    super();
    this.db = db;
    this.table = table;
    this.interval_ms = interval_ms;

    // client listens for results of query -- if queries pile up, and
    // there are many tables, the default of 10 can easily be exceeded.
    this.setMaxListeners(100);
  }

  private dbg(f): Function {
    return this.db._dbg(`ThrottledTableQueue('${this.table}').${f}`);
  }

  public close(): void {
    if (this.state == "closed") {
      return;
    }
    if (this.process_timer != null) {
      clearTimeout(this.process_timer);
    }
    for (const k in this.queue) {
      this.emit(k, "closed");
    }
    this.emit("closed");
    this.removeAllListeners();
    close(this);
    this.state = "closed";
  }

  public enqueue(query: TableQuery): string {
    if (this.state == "closed") {
      throw Error("trying to enqueue after close");
    }
    const k = key(query);
    this.queue[k] = query;
    if (this.process_timer == null) {
      this.dbg("enqueue")(`will process queue in ${this.interval_ms}ms...`);
      this.process_timer = setTimeout(
        this.process_queue.bind(this),
        this.interval_ms
      );
    }
    return k;
  }

  private async process_queue(): Promise<void> {
    const dbg = this.dbg("process_queue");
    delete this.process_timer; // it just fired
    // First time we just doing them one at a time.
    // FURTHER WORK: we could instead do ALL queries simultaneously as
    // a single query, or at least do them in parallel...

    // Make a copy of whatever is queued up at this moment in time,
    // then clear the queue.  We are responsible for handling all
    // queries in the queue now, but nothing further.  If queries are
    // slow, it can easily be the case that process_queue is
    // called several times at once.  However, that's fine, since
    // each call is responsible for only the part of the queue that
    // existed when it was called.
    const queue = copy(this.queue);
    this.queue = {};

    for (const k in queue) {
      dbg(k);
      const { select, where } = queue[k];

      try {
        const result = await callback(
          one_query,
          this.db,
          select,
          this.table,
          where
        );
        if (this.state == "closed") return;
        dbg("success", k);
        this.emit(k, undefined, result);
      } catch (err) {
        if (this.state == "closed") return;
        dbg("fail", k);
        this.emit(k, err, undefined);
      }
    }
  }
}

const throttled_table_queues: { [table: string]: ThrottledTableQueue } = {};

function throttled_table_queue(
  db: PostgreSQL,
  table: string,
  interval_ms: number
): ThrottledTableQueue {
  if (throttled_table_queues[table] != null) {
    return throttled_table_queues[table];
  }
  return (throttled_table_queues[table] = new ThrottledTableQueue(
    db,
    table,
    interval_ms
  ));
}

export async function query(opts: QueryOpts): Promise<any> {
  if (THROTTLE && opts.one) {
    const Table = throttled_table_queue(opts.db, opts.table, THROTTLE_MS);
    const k: string = Table.enqueue({ select: opts.select, where: opts.where });
    const [err, result] = await once(Table, k);
    if (err != null) {
      throw err;
    }
    return result;
  }
  return await callback(
    opts.one ? one_query : all_query,
    opts.db,
    opts.select,
    opts.table,
    opts.where
  );
}

function all_query(db, select, table, where, cb): void {
  db._query({ select, table, where, cb: all_results(cb) });
}

function one_query(db, select, table, where, cb): void {
  db._query({ select, table, where, cb: one_result(cb) });
}
