#!/usr/bin/env node
/*
Delete expired rows in the database.
*/

const postgres = require("@cocalc/database");

const WAIT_BETWEEN_RUNS_S = process.env.WAIT_BETWEEN_RUNS_S ?? "7200";
const INTERVAL_MS = parseInt(WAIT_BETWEEN_RUNS_S) * 1000;
const db = postgres.db({ ensure_exists: false });

function delete_expired(cb) {
  console.log("deleted_expired rows in database");
  return db.delete_expired({ count_only: false, cb });
}

function go() {
  console.log("go");
  delete_expired(function (err) {
    if (err) {
      console.log(`failed to delete all expired rows -- ${err}`);
    }
    console.log(
      `now waiting ${INTERVAL_MS} seconds before doing another delete...`,
    );
    setTimeout(go, INTERVAL_MS);
  });
}

go();
