/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 5: Connection Management - _connect implementation
*/

import getPool from "@cocalc/database/pool";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import type { CB } from "@cocalc/util/types/callback";

import { recordDisconnected } from "../record-connect-error";

export async function connectDo(db: PostgreSQL, cb?: CB): Promise<void> {
  const dbAny = db as any;
  const dbg = db._dbg("_connect");
  dbg("connect using pool");
  if (dbAny._state === "closed") {
    dbAny._connected = false;
    if (typeof cb === "function") {
      cb("not_public");
    }
    return;
  }
  dbAny._clear_listening_state(); // definitely not listening
  if (db._listen_client != null) {
    db.disconnect();
  }
  dbAny._connect_time = 0;
  db._concurrent_queries = 0; // can't be any going on now.
  try {
    db._pool ??= getPool({ ensureExists: db._ensure_exists });
    const poolEnding = (db._pool as { ending?: boolean }).ending;
    if (db._pool.ended || poolEnding) {
      dbAny._connected = false;
      if (typeof cb === "function") {
        cb("not_public");
      }
      return;
    }
    await db._pool.query("SELECT NOW()");
    dbAny._connect_time = new Date();
    dbAny._connected = true;
    db._concurrent_queries = 0;
    dbg("connected!");
    if (typeof cb === "function") {
      cb(undefined, db);
    }
  } catch (err) {
    const errString = String(err);
    const errMessage = err instanceof Error ? err.message : errString;
    const isPoolClosedError = errString.includes(
      "Cannot use a pool after calling end on the pool",
    );
    if (
      db._pool?.ended ||
      (db._pool as { ending?: boolean } | undefined)?.ending ||
      errMessage.includes("Cannot use a pool after calling end on the pool") ||
      isPoolClosedError
    ) {
      dbAny._connected = false;
      if (typeof cb === "function") {
        cb("not_public");
      }
      return;
    }
    const mesg = `Failed to connect to database -- ${errString}`;
    dbg(mesg);
    if (
      !isPoolClosedError &&
      dbAny._state !== "closed" &&
      process.env.NODE_ENV !== "test" &&
      process.env.JEST_WORKER_ID == null &&
      process.env.PGDATABASE !== "smc_ephemeral_testing_database"
    ) {
      console.warn(mesg); // make it clear for interactive users with debugging off -- common mistake with env not setup right.
    }
    // If we're unable to connect, we are disconnected. This tells postgres/record-connect-error.ts about this problem.
    db.emit("disconnect");
    recordDisconnected();
    dbAny._connected = false;
    if (typeof cb === "function") {
      cb(err);
    }
  }
}
