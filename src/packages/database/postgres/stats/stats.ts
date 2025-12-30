/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { RECENT_TIMES, RECENT_TIMES_KEY } from "@cocalc/util/schema";
import * as misc from "@cocalc/util/misc";
const { defaults } = misc;
const required = defaults.required;
import { map, zipObject } from "lodash";

import { PostgreSQL } from "../types";
import { EXTENSIONS } from "@cocalc/util/db-schema/stats";
const { all_results } = require("../../postgres-base");

// some stats queries have to crunch a lot of rows, which could take a bit
// we give them a couple of minutes each…
const QUERY_TIMEOUT_S = 300;

interface Opts {
  ttl_dt: number; // 15 secs subtracted from ttl to compensate for computation duration when called via a cronjob
  ttl: number; // how long cached version lives (in seconds)
  ttl_db: number; // how long a valid result from a db query is cached in any case
  update: boolean; // if true: recalculate if older than ttl; false: don't recalculate and pick it from the DB (locally cached for ttl secs)
  cb: (err, stats) => void;
}

type Data = { [key: string]: number };

interface RunningProjects {
  free: number;
  member: number;
}

// TODO type this to fit with fields defined in db-schema/stats.ts
interface Stats {
  id: string;
  time: Date;
  accounts: number;
  projects: number;
  projects_created: Data;
  projects_edited: Data;
  accounts_created: Data;
  accounts_active: Data;
  running_projects: RunningProjects;
  hub_servers: any;
  files_opened: {
    distinct: Data;
    total: Data;
  };
}

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
    timeout_s: QUERY_TIMEOUT_S,
  });
  // count_result
  return parseInt(result?.rows?.[0]?.count);
}

function _count_opened_files_query(distinct: boolean): string {
  const extensions = EXTENSIONS.map((x) => `'${x}'`).join(", ");
  return `\
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
WHERE ext IN (${extensions}) ORDER BY ext
`;
}

async function _count_opened_files(db: PostgreSQL, opts): Promise<void> {
  opts = defaults(opts, {
    age_m: undefined,
    key: required,
    data: required,
    distinct: required, // true or false
  });
  const { age_m, key, data, distinct } = opts;
  const q = _count_opened_files_query(distinct);

  const res = await cb2(db._query, {
    query: q,
    params: [misc.minutes_ago(age_m)],
    timeout_s: QUERY_TIMEOUT_S,
  });

  // misc.copy? see "all_results"
  const rows = res.rows.map((x) => misc.copy(x));
  const values = zipObject(map(rows, "ext"), map(rows, "cnt"));
  data[key] = values;
}

function check_local_cache({ update, ttl_dt, ttl, ttl_db, dbg }): Stats | null {
  if (_stats_cached == null) return null;

  // decide if cache should be used -- tighten interval if we are allowed to update
  const offset_dt = update ? ttl_dt : 0;
  const is_cache_recent =
    _stats_cached.time > misc.seconds_ago(ttl - offset_dt);
  // in case we aren't allowed to update and the cache is outdated, do not query db too often
  const did_query_recently =
    _stats_cached_db_query != null &&
    _stats_cached_db_query > misc.seconds_ago(ttl_db);
  if (is_cache_recent || did_query_recently) {
    dbg(
      `using locally cached stats from ${
        (new Date().getTime() - _stats_cached.time) / 1000
      } secs ago.`,
    );
    return _stats_cached;
  }
  return null;
}

async function check_db_cache({
  db,
  update,
  ttl,
  ttl_dt,
  dbg,
}): Promise<Stats | null> {
  try {
    const res = await cb2(db._query, {
      query: "SELECT * FROM stats ORDER BY time DESC LIMIT 1",
    });
    if (res?.rows?.length != 1) {
      dbg("no data (1)");
      return null;
    }

    const x = misc.map_without_undefined_and_null(res.rows[0]) as any;
    if (x == null) {
      dbg("no data (2)");
      return null;
    }

    dbg(`check_db_cache x = ${misc.to_json(x)}`);

    _stats_cached_db_query = new Date();
    if (update && x.time < misc.seconds_ago(ttl - ttl_dt)) {
      dbg("cache outdated -- will update stats");
      return null;
    } else {
      dbg(
        `using db stats from ${
          (new Date().getTime() - x.time) / 1000
        } secs ago.`,
      );
      // storing still valid result in local cache
      _stats_cached = misc.deep_copy(x);
      return _stats_cached;
    }
  } catch (err) {
    dbg("problem with query -- no stats in db?");
    throw err;
  }
}

const running_projects_query = `\
SELECT count(*), run_quota -> 'member_host' AS member
FROM projects
WHERE state ->> 'state' in ('running', 'starting')
GROUP BY member`;

async function calc_running_projects(db): Promise<RunningProjects> {
  const data = { free: 0, member: 0 };
  const res = await cb2(db._query, { query: running_projects_query });
  for (const row of res.rows) {
    if (row.member) {
      data.member = parseInt(row.count);
    } else {
      data.free = parseInt(row.count);
    }
  }
  return data;
}

async function _calc_stats({ db, dbg, start_t }): Promise<Stats> {
  const stats: Stats = {
    id: misc.uuid(),
    time: new Date(),
    accounts: 0,
    projects: 0,
    projects_created: {},
    projects_edited: {},
    accounts_created: {},
    accounts_active: {},
    files_opened: { distinct: {}, total: {} },
    hub_servers: [],
    running_projects: { free: 0, member: 0 },
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

  stats.accounts_active[K.active] = await _count_timespan(db, {
    table: "accounts",
    field: "last_active",
    age_m: R.active,
  });

  await new Promise<void>((done, reject) => {
    db._query({
      query: "SELECT expire, host, clients FROM hub_servers",
      cb: all_results((err, hub_servers) => {
        if (err) {
          reject(err);
        } else {
          const now = new Date();
          stats.hub_servers = [];
          for (let x of hub_servers) {
            if (x.expire > now) {
              delete x.expire;
              stats.hub_servers.push(x);
            }
          }
          done();
        }
      }),
    });
  });

  // this was running in parallel, but there is no hurry updating the stats...
  for (const tkey of ["last_month", "last_week", "last_day", "last_hour"]) {
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
    stats.accounts_active[K[tkey]] = await _count_timespan(db, {
      table: "accounts",
      field: "last_active",
      age_m: R[tkey],
    });
    stats.accounts_created[K[tkey]] = await _count_timespan(db, {
      table: "accounts",
      field: "created",
      age_m: R[tkey],
    });
  }

  stats.running_projects = await calc_running_projects(db);

  const elapsed_t = process.hrtime(start_t);
  const duration_s = (elapsed_t[0] + elapsed_t[1] / 1e9).toFixed(4);
  dbg(
    `everything succeeded above after ${duration_s} secs -- now insert stats`,
  );
  // storing in local and db cache
  _stats_cached = misc.deep_copy(stats);
  await cb2(db._query, {
    query: "INSERT INTO stats",
    values: stats,
  });

  return stats;
}

export async function calc_stats(db: PostgreSQL, opts: Opts) {
  const { ttl_dt, ttl, ttl_db, update, cb } = opts;

  const start_t = process.hrtime();
  const dbg = db._dbg("get_stats");

  let stats: Stats | null = null;
  stats = check_local_cache({ update, ttl_dt, ttl, ttl_db, dbg });
  if (stats == null) {
    dbg("checking db cache?");
    stats = await check_db_cache({ db, update, ttl, ttl_dt, dbg });
  }

  if (stats != null) {
    dbg(`stats != null → nothing to do`);
  } else if (!update) {
    dbg("warning: no recent stats but not allowed to update");
  } else {
    dbg("we're actually recomputing the stats");
    try {
      stats = await _calc_stats({ db, dbg, start_t });
    } catch (err) {
      dbg(`error calculating stats: err=${err}`);
      cb?.(err, null);
      return;
    }
  }

  dbg(`stats=${misc.to_json(stats)})`);
  // uncomment to fully debug the resulting stats object
  //console.debug(JSON.stringify(stats, null, 2));
  //process.exit();
  cb?.(undefined, stats);
  return stats;
}

// for testing only
if (process.env["NODE_DEV"] === "TEST") {
  exports._count_opened_files_query = _count_opened_files_query;
}
