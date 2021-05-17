#!/usr/bin/env node
/*
Moving patches from non-recently-used syncstrings to blobs.
*/

import * as postgres from "smc-hub/postgres";
const db = postgres.db({ ensure_exists: false });

let {
  WAIT_BETWEEN_RUNS_S,
  MAX_SYNCSTRINGS_PER_RUN,
  SYNCSTRINGS_AT_ONCE,
  MIN_AGE_DAYS,
  DELAY_MS,
} = process.env;

if (WAIT_BETWEEN_RUNS_S == null) {
  WAIT_BETWEEN_RUNS_S = "30";
}
if (MAX_SYNCSTRINGS_PER_RUN == null) {
  MAX_SYNCSTRINGS_PER_RUN = "100";
}
if (SYNCSTRINGS_AT_ONCE == null) {
  SYNCSTRINGS_AT_ONCE = "1";
}
if (MIN_AGE_DAYS == null) {
  MIN_AGE_DAYS = "60.5";
}
if (DELAY_MS == null) {
  DELAY_MS = "5000";
}

function syncstring_maintenance(cb: Function): void {
  console.log(
    `syncstring_maintenance: moving patches for up to ${MAX_SYNCSTRINGS_PER_RUN} syncstrings at least ${MIN_AGE_DAYS} days old to compressed blobs...`
  );
  db.syncstring_maintenance({
    limit: parseInt(MAX_SYNCSTRINGS_PER_RUN as string),
    map_limit: parseInt(SYNCSTRINGS_AT_ONCE as string),
    age_days: parseFloat(MIN_AGE_DAYS as string),
    delay: parseInt(DELAY_MS as string),
    repeat_until_done: false,
    cb,
  });
}

function go() {
  console.log("go");
  syncstring_maintenance(function (err) {
    if (err) {
      throw Error(`error in syncstring_maintenance -- ${err}`);
    }
    console.log(
      `now waiting ${WAIT_BETWEEN_RUNS_S} seconds before doing another syncstring_maintenance...`
    );
    setTimeout(go, parseInt(WAIT_BETWEEN_RUNS_S as string) * 1000);
  });
}

go();
