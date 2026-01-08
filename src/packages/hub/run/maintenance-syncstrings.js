#!/usr/bin/env node
/*
Moving patches from non-recently-used syncstrings to blobs.
*/

const postgres = require("@cocalc/database");

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

function syncstring_maintenance(cb) {
  console.log(
    `syncstring_maintenance: moving patches for up to ${MAX_SYNCSTRINGS_PER_RUN} syncstrings at least ${MIN_AGE_DAYS} days old to compressed blobs...`,
  );
  db.syncstring_maintenance({
    limit: parseInt(MAX_SYNCSTRINGS_PER_RUN),
    map_limit: parseInt(SYNCSTRINGS_AT_ONCE),
    age_days: parseFloat(MIN_AGE_DAYS),
    delay: parseInt(DELAY_MS),
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
      `now waiting ${WAIT_BETWEEN_RUNS_S} seconds before doing another syncstring_maintenance...`,
    );
    setTimeout(go, parseInt(WAIT_BETWEEN_RUNS_S) * 1000);
  });
}

go();
