/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const async = require("async");
const misc = require("smc-util/misc");
//import { promisify } from "util";
const { defaults } = misc;
const required = defaults.required;
const _ = require("underscore");

import { PostgreSQL } from "./types";
import { callback2 as cb2 } from "../smc-util/async-utils";
const { one_result, all_results } = require("../postgres-base");

import { RECENT_TIMES, RECENT_TIMES_KEY } from "smc-util/schema";

interface Opts {
  ttl_dt: number; // 15 secs subtracted from ttl to compensate for computation duration when called via a cronjob
  ttl: number; // how long cached version lives (in seconds)
  ttl_db: number; // how long a valid result from a db query is cached in any case
  update: boolean; // if true: recalculate if older than ttl; false: don't recalculate and pick it from the DB (locally cached for ttl secs)
  cb: (err, stats) => void;
}

// TODO make this an interface
type Stats = any;

let _stats_cached: any = null;
let _stats_cached_db_query: Date | null = null;

async function _count_timespan(db: PostgreSQL, opts): Promise<any> {
  opts = defaults(opts, {
    table: required,
    field: undefined,
    age_m: undefined,
    upper_m: undefined, // defaults to zero minutes (i.e. "now")
  });
  const { table, field, age_m, upper_m } = opts;
  const where = {};
  if (field != null) {
    if (age_m != null) {
      where[`${field} >= $::TIMESTAMP`] = misc.minutes_ago(age_m);
    }
    if (upper_m != null) {
      where[`${field} <= $::TIMESTAMP`] = misc.minutes_ago(upper_m);
    }
  }
  const result = await cb2(db._query, {
    query: `SELECT COUNT(*) FROM ${table}`,
    where,
  });
  // count_result
  return parseInt(result?.rows?.[0]?.count);
}

async function _count_opened_files(db: PostgreSQL, opts): Promise<void> {
  opts = defaults(opts, {
    age_m: undefined,
    key: required,
    data: required,
    distinct: required, // true or false
  });
  const { age_m, key, data, distinct } = opts;
  const q = `\
WITH filenames AS (
    SELECT ${distinct ? "DISTINCT" : ""} event ->> 'filename' AS fn
    FROM project_log
    WHERE time BETWEEN $1::TIMESTAMP AND NOW()
      AND event @> '{"action" : "open"}'::jsonb
), ext_count AS (
    SELECT COUNT(*) as cnt, lower(reverse(split_part(reverse(fn), '.', 1))) AS ext
    FROM filenames
    GROUP BY ext
)
SELECT ext, cnt
FROM ext_count
WHERE ext IN ('sagews', 'ipynb', 'tex', 'rtex', 'rnw', 'x11',
              'rmd', 'txt', 'py', 'md', 'sage', 'term', 'rst', 'lean',
              'png', 'svg', 'jpeg', 'jpg', 'pdf',
              'tasks', 'course', 'sage-chat', 'chat')
ORDER BY ext
`;

  const res = await cb2(db._query, {
    query: q,
    params: [misc.minutes_ago(age_m)],
  });

  // misc.copy? see "all_results"
  const rows = res.rows.map((x) => misc.copy(x));
  const values = _.object(_.pluck(rows, "ext"), _.pluck(rows, "cnt"));
  data[key] = values;
}

export async function calc_stats(db: PostgreSQL, opts: Opts) {
  const { ttl_dt, ttl, ttl_db, update, cb } = opts;
  let stats: Stats = undefined;
  const start_t = process.hrtime();
  const dbg = db._dbg("get_stats");
  async.series(
    [
      (cb) => {
        dbg("using cached stats?");
        if (_stats_cached != null) {
          // decide if cache should be used -- tighten interval if we are allowed to update
          const offset_dt = update ? ttl_dt : 0;
          const is_cache_recent =
            _stats_cached.time > misc.seconds_ago(ttl - offset_dt);
          // in case we aren't allowed to update and the cache is outdated, do not query db too often
          const did_query_recently =
            _stats_cached_db_query != null &&
            _stats_cached_db_query > misc.seconds_ago(ttl_db);
          if (is_cache_recent || did_query_recently) {
            stats = _stats_cached;
            dbg(
              `using locally cached stats from ${
                (new Date().getTime() - stats.time) / 1000
              } secs ago.`
            );
            cb();
          }
        }
        db._query({
          query: "SELECT * FROM stats ORDER BY time DESC LIMIT 1",
          cb: one_result((err, x) => {
            if (err || x == null) {
              dbg("problem with query -- no stats in db?");
              cb(err);
            }
            // query successful, since x exists
            _stats_cached_db_query = new Date();
            if (update && x.time < misc.seconds_ago(ttl - ttl_dt)) {
              dbg("cache outdated -- will update stats");
              cb();
            } else {
              dbg(
                `using db stats from ${
                  (new Date().getTime() - x.time) / 1000
                } secs ago.`
              );
              stats = x;
              // storing still valid result in local cache
              _stats_cached = misc.deep_copy(stats);
              cb();
            }
          }),
        });
      },
      async (cb) => {
        if (stats != null) {
          cb();
        } else if (!update) {
          dbg("warning: no recent stats but not allowed to update");
          cb();
        }
        dbg("querying all stats from the DB");
        stats = {
          time: new Date(),
          projects_created: {},
          projects_edited: {},
          accounts_created: {},
          files_opened: { distinct: {}, total: {} },
        };
        const R = RECENT_TIMES;
        const K = RECENT_TIMES_KEY;

        stats.accounts = await _count_timespan(db, {
          table: "accounts",
        });
        stats.projects = await _count_timespan(db, {
          table: "projects",
        });
        stats.projects_edited[K.active] = await _count_timespan(db, {
          table: "projects",
          field: "last_edited",
          age_m: R.active,
        });
        await cb2(db._query, {
          query: "SELECT expire, host, clients FROM hub_servers",
          cb: all_results((err, hub_servers) => {
            if (err) {
              cb(err);
            } else {
              const now = new Date();
              stats.hub_servers = [];
              for (let x of hub_servers) {
                if (x.expire > now) {
                  delete x.expire;
                  stats.hub_servers.push(x);
                }
              }
              cb();
            }
          }),
        });
        // this was running in parallel, but there is no hurry updating the stats...
        for (const tkey of [
          "last_month",
          "last_week",
          "last_day",
          "last_hour",
        ]) {
          await _count_opened_files(db, {
            age_m: R[tkey],
            key: K[tkey],
            data: stats.files_opened.distinct,
            distinct: true,
          });
          await _count_opened_files(db, {
            age_m: R[tkey],
            key: K[tkey],
            data: stats.files_opened.total,
            distinct: false,
          });
          stats.projects_edited[K[tkey]] = await _count_timespan(db, {
            table: "projects",
            field: "last_edited",
            age_m: R[tkey],
          });
          stats.projects_created[K[tkey]] = await _count_timespan(db, {
            table: "projects",
            field: "created",
            age_m: R[tkey],
          });
          stats.accounts_created[K[tkey]] = await _count_timespan(db, {
            table: "accounts",
            field: "created",
            age_m: R[tkey],
          });
        }

        const elapsed_t = process.hrtime(start_t);
        const duration_s = (elapsed_t[0] + elapsed_t[1] / 1e9).toFixed(4);
        dbg(
          `everything succeeded above after ${duration_s} secs -- now insert stats`
        );
        // storing in local and db cache
        stats.id = misc.uuid();
        _stats_cached = misc.deep_copy(stats);
        await cb2(db._query, {
          query: "INSERT INTO stats",
          values: stats,
        });
      },
    ],
    (err) => {
      dbg(`get_stats final CB: (${misc.to_json(err)}, ${misc.to_json(stats)})`);
      // fully debug the resulting stats object
      //console.debug(JSON.stringify(stats, null, 2)); process.exit();
      cb?.(err, stats);
    }
  );
}
