/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 5: Connection Management

TypeScript implementations of connection management methods.

Methods implemented here:
- connect(db, opts) - Connect with retry orchestration
- disconnect(db) - Close all client connections
- isConnected(db) - Check connection status
- getClient(db) - Get pg client for queries (round-robin)
- close(db) - Full cleanup (clients, cache, test query)
*/

import * as misc from "@cocalc/util/misc";

import type { PostgreSQL } from "../types";
import type { Client } from "pg";
import type { CB } from "@cocalc/util/types/callback";

import { recordConnected } from "../record-connect-error";

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
  if (db._clients != null) {
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
        db.emit("connect");
        return recordConnected();
      }
    },
  });
}

/**
 * Close all database client connections
 *
 * Ends all active pg.Client connections and removes event listeners.
 * Clears the _clients array but does not change connection state.
 *
 * @param db - PostgreSQL database instance
 */
export function disconnect(db: PostgreSQL): void {
  if (db._clients) {
    for (const client of db._clients) {
      client.end();
      client.removeAllListeners();
    }
    delete db._clients;
  }
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
  return db._clients != null && db._clients.length > 0;
}

/**
 * Get a PostgreSQL client connection for queries
 *
 * Returns a pg.Client using round-robin load balancing across
 * multiple connections. Returns undefined if not connected.
 *
 * Implementation:
 * - If no clients, returns undefined
 * - If one client, returns that client
 * - If multiple clients, cycles through them using _client_index
 *
 * @param db - PostgreSQL database instance
 * @returns pg.Client or undefined if not connected
 */
export function getClient(db: PostgreSQL): Client | undefined {
  if (!db._clients) {
    return undefined;
  }

  if (db._clients.length <= 1) {
    return db._clients[0];
  }

  // Round-robin through multiple clients
  if (db._client_index == null) {
    db._client_index = -1;
  }

  db._client_index = db._client_index + 1;

  if (db._client_index >= db._clients.length) {
    db._client_index = 0;
  }

  return db._clients[db._client_index];
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
 * 6. Closes and removes all client connections
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

  // Close all client connections
  if (db._clients) {
    for (const client of db._clients) {
      client.removeAllListeners();
      client.end();
    }
    delete db._clients;
  }
}
