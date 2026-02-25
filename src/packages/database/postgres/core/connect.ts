/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 5: Connection Management

TypeScript implementations of connection management methods.

Methods implemented here:
- connect(db, opts) - Connect with retry orchestration
- disconnect(db) - Release listener client
- isConnected(db) - Check connection status
- close(db) - Full cleanup (listener + pinned query clients, cache, test query)
*/

import * as misc from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/callback";

import { recordConnected } from "../record-connect-error";
import type { PostgreSQL } from "../types";

/**
 * Connect to the database (with retry).
 *
 * Handles connection state, deduplicates concurrent connect attempts,
 * and triggers _connect via retry_until_success.
 */
export function connect(
  db: PostgreSQL,
  opts?: { max_time?: number; cb?: CB },
): void {
  const dbAny = db as any;
  const { max_time, cb } = opts ?? {};
  if (dbAny._state === "closed") {
    if (typeof cb === "function") {
      cb("closed");
    }
    return;
  }
  const dbg = db._dbg("connect");
  if (dbAny._connected) {
    dbg("already connected");
    if (typeof cb === "function") {
      cb();
    }
    return;
  }
  if (dbAny._connecting != null) {
    dbg("already trying to connect");
    dbAny._connecting.push(cb);
    // keep several times the db-concurrent-warn limit of callbacks
    const max_connecting = 5 * dbAny._concurrent_warn;
    while (dbAny._connecting.length > max_connecting) {
      dbAny._connecting.shift();
      dbg(
        `WARNING: still no DB available, dropping old callbacks (limit: ${max_connecting})`,
      );
    }
    return;
  }
  dbg("will try to connect");
  dbAny._state = "init";
  if (max_time) {
    dbg(`for up to ${max_time}ms`);
  } else {
    dbg("until successful");
  }
  dbAny._connecting = [cb];
  return misc.retry_until_success({
    f: dbAny._connect,
    max_delay: 10000,
    max_time,
    start_delay: 500 + 500 * Math.random(),
    log: dbg,
    cb: (err) => {
      const v = dbAny._connecting;
      delete dbAny._connecting;
      for (const cb of Array.from(v || [])) {
        if (typeof cb === "function") {
          cb(err);
        }
      }
      if (!err) {
        dbAny._state = "connected";
        dbAny._connected = true;
        db.emit("connect");
        return recordConnected();
      }
    },
  });
}

/**
 * Release the dedicated listener client (if any)
 *
 * Clears the listener client and marks the connection as disconnected.
 *
 * @param db - PostgreSQL database instance
 */
export function disconnect(db: PostgreSQL): void {
  const dbAny = db as any;
  if (db._listen_client) {
    db._listen_client.removeAllListeners();
    db._listen_client.release();
    delete db._listen_client;
  }
  dbAny._connected = false;
}

/**
 * Check if database is connected
 *
 * Returns true if there are active client connections available.
 *
 * @param db - PostgreSQL database instance
 * @returns true if connected with at least one client
 */
export function isConnected(db: PostgreSQL): boolean {
  return (db as any)._connected === true;
}

/**
 * Close database and cleanup all resources
 *
 * Performs full cleanup:
 * 1. Checks if already closed (no-op if so)
 * 2. Closes test query interval
 * 3. Sets state to 'closed'
 * 4. Emits 'close' event
 * 5. Removes all event listeners
 * 6. Releases listener client and any pinned query client
 *
 * @param db - PostgreSQL database instance
 */
export function closeDatabase(db: PostgreSQL): void {
  if ((db as any)._state === "closed") {
    return; // Already closed, nothing to do
  }

  // Close health monitoring
  db._close_test_query();

  // Update state
  (db as any)._state = "closed";

  // Emit close event
  db.emit("close");

  // Remove all event listeners
  db.removeAllListeners();

  // Release listen client
  if (db._query_client) {
    db._query_client.removeAllListeners();
    db._query_client.release();
    delete db._query_client;
  }
  if (db._listen_client) {
    db._listen_client.removeAllListeners();
    db._listen_client.release();
    delete db._listen_client;
  }
  (db as any)._connected = false;
}
