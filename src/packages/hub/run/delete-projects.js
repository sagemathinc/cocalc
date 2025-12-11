#!/usr/bin/env node

/*
Periodically delete projects.

STATUS:
For now, this just calls the unlink function and deletes all assocated syncstrings and data.
In "onprem" mode, this also entries in various tables, which contain data specific to the deleted projects.

TESTING: to run this in development and see logging, call it like that:
./src/packages/hub$ env DEBUG_CONSOLE=yes DEBUG=cocalc:debug:db:* pnpm cocalc-hub-delete-projects
*/

import * as postgres from "@cocalc/database";

const INTERVAL_H = process.env.INTERVAL_H ?? "4";
const INTERVAL_MS = parseInt(INTERVAL_H) * 60 * 60 * 1000;

async function update() {
  const db = postgres.db({ ensure_exists: false });
  console.log("unlinking old deleted projects...");
  try {
    await db.unlink_old_deleted_projects();
    // limit the max runtime to half the interval time
    const max_run_m = (INTERVAL_MS / 2) / (1000 * 60)
    await db.cleanup_old_projects_data(max_run_m);
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
