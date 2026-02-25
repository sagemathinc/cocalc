#!/usr/bin/env node
/*
Delete expired rows in the database.
*/

const postgres = require("@cocalc/database");

const db = postgres.db({ ensure_exists: false });

let {
  WAIT_BETWEEN_RUNS_S,
  MAX_BLOBS_PER_RUN,
  BLOBS_AT_ONCE,
  COCALC_BLOB_STORE,
  WAIT_BETWEEN_UPLOADS_S,
  CUTOFF,
} = process.env;

if (WAIT_BETWEEN_RUNS_S == null) {
  WAIT_BETWEEN_RUNS_S = "120";
}
if (MAX_BLOBS_PER_RUN == null) {
  MAX_BLOBS_PER_RUN = "2000";
}
if (BLOBS_AT_ONCE == null) {
  BLOBS_AT_ONCE = "10";
}
if (COCALC_BLOB_STORE == null) {
  COCALC_BLOB_STORE = "/blobs";
}
if (WAIT_BETWEEN_UPLOADS_S == null) {
  WAIT_BETWEEN_UPLOADS_S = "0";
}
if (CUTOFF == null) {
  CUTOFF = "2 months";
}

function move_blobs_to_gcloud(cb) {
  console.log(
    `move_blobs_to_gcloud: copying up to ${MAX_BLOBS_PER_RUN} non-expiring blobs to bucket ${COCALC_BLOB_STORE} and deleting them from the database`,
  );
  db.copy_all_blobs_to_gcloud({
    bucket: COCALC_BLOB_STORE,
    limit: parseInt(MAX_BLOBS_PER_RUN),
    map_limit: parseInt(BLOBS_AT_ONCE),
    repeat_until_done_s: 0,
    remove: true,
    throttle: parseFloat(WAIT_BETWEEN_UPLOADS_S),
    cutoff: CUTOFF,
    cb,
  });
}

function go() {
  console.log("go");
  move_blobs_to_gcloud(function (err) {
    if (err) {
      throw Error(`error in move_blobs_to_gcloud -- ${err}`);
    }
    console.log(
      `now waiting ${WAIT_BETWEEN_RUNS_S} seconds before doing another move_blobs_to_gcloud...`,
    );
    setTimeout(go, parseFloat(WAIT_BETWEEN_RUNS_S) * 1000);
  });
}

go();
