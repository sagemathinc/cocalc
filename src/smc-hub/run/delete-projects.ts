#!/usr/bin/env node
/*
Periodically delete projects.

TODO: For now, this just calls the unlink function. Later on it
should do more (actually delete data, etc.).
*/

import * as postgres from "smc-hub/postgres";

const INTERVAL_H = process.env.INTERVAL_H ?? "4";
const INTERVAL_MS = parseInt(INTERVAL_H) * 60 * 60 * 1000;
const db = postgres.db({ ensure_exists: false });

async function update() {
  console.log("unlinking old deleted projects...");
  try {
    await db.unlink_old_deleted_projects();
  } catch (err) {
    if (err !== null) {
      throw Error(`failed to unlink projects -- ${err}`);
    } else {
      console.log("unlink projects done");
    }
  }
  console.log(`Waiting ${INTERVAL_H} hours...`);
  setTimeout(update, INTERVAL_MS);
}

update();
