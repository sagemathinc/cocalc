/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Determine function that does query.
*/

const DISABLE_STANDBY: boolean = true; // if true, never use standby server at all.

const async = require("async");

import { delay } from "awaiting";

import { SCHEMA } from "../../schema";
import { copy } from "../../misc2";

export function query_function(
  client_query: Function,
  table: string
): Function {
  const s = SCHEMA[table];
  if (s == null) {
    throw Error(`unknown table ${table}`);
  }
  const db_standby = s.db_standby;

  if (DISABLE_STANDBY || !db_standby) {
    // just use default client.query, which queries the master database.
    return client_query;
  }

  function do_query(opts: any): void {
    if (opts == null) {
      throw Error("opts must be an object");
    }

    let read_done: boolean = false;
    const change_queue: { err: any; change: any }[] = [];

    function do_initial_read_query(cb: Function): void {
      const opts2 = copy(opts);
      opts2.standby = true;
      opts2.changes = false;
      let cb_called: boolean = false;
      opts2.cb = async function (err, resp): Promise<void> {
        opts.cb(err, resp);
        if (!err) {
          read_done = true;
          if (change_queue.length > 0) {
            // CRITICAL: delay, since these must be pushed out in a later event loop.
            // Without this delay, there will be many random failures.
            await delay(0);
            while (change_queue.length > 0) {
              const x = change_queue.shift();
              if (x == null) break; // make typescript happy.
              const { err, change } = x;
              opts.cb(err, change);
            }
          }
        }
        if (!cb_called) {
          cb_called = true;
          cb(err);
        }
      };
      client_query(opts2);
    }

    function start_changefeed(cb: Function): void {
      let first_resp: boolean = true;
      const opts2 = copy(opts);
      opts2.standby = false;
      opts2.changes = true;
      opts2.cb = function (err, change): void {
        if (read_done) {
          opts.cb(err, change);
        } else {
          change_queue.push({ err, change });
        }
        if (first_resp) {
          first_resp = false;
          cb(err);
        }
      };
      opts2.options = opts2.options.concat({ only_changes: true });
      client_query(opts2);
    }

    let f: Function;
    if (db_standby === "unsafe") {
      /* If db_standby == 'unsafe', then we do not even require
         the changefeed to be working before doing the full query.
         This will for sure miss all changes from when the query
         finishes until the changefeed starts.  For some
         tables this is fine; for others, not. */

      f = async.parallel;
    } else {
      // Otherwise, the query could miss a small amount of data,
      // but only for a tiny window of time.
      f = async.series;
    }

    f([do_initial_read_query, start_changefeed]);
  }

  return do_query;
}
