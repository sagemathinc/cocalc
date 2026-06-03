/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 4: Test Query & Health Monitoring

TypeScript implementations of health monitoring methods that use
periodic test queries to ensure database connection is working:
- initTestQuery(db) - Initialize periodic health check
- closeTestQuery(db) - Stop health check interval
- doTestQuery(db) - Execute health check query

These methods use instance properties on the db object to store
the test query interval timer.
*/

import type { PostgreSQL } from "../types";

/**
 * Execute a simple health check query
 *
 * Performs a "SELECT NOW()" query to verify the database connection
 * is responding. If the query times out, the connection will be
 * recreated by the timeout mechanism in _query.
 *
 * @param db - PostgreSQL database instance
 */
export function doTestQuery(db: PostgreSQL): void {
  const dbg = db._dbg("test_query");
  dbg("starting");

  db._query({
    query: "SELECT NOW()",
    cb: (err, result) => {
      dbg("finished", err, result);
    },
  });
}

/**
 * Initialize periodic test query for connection health monitoring
 *
 * If _timeout_ms is set, creates an interval that periodically
 * executes doTestQuery to ensure the database connection is working.
 * If a test query times out, the connection will be recreated.
 *
 * Stores the interval timer in db._test_query for later cleanup.
 *
 * @param db - PostgreSQL database instance
 */
export function initTestQuery(db: PostgreSQL): void {
  if (!db._timeout_ms) {
    return;
  }
  if (process.env.JEST_WORKER_ID != null || process.env.NODE_ENV === "test") {
    return;
  }

  db._test_query = setInterval(() => {
    db._do_test_query();
  }, db._timeout_ms);
}

/**
 * Stop the periodic test query interval
 *
 * Clears the test query interval if it exists and removes the
 * _test_query property from the database instance.
 *
 * @param db - PostgreSQL database instance
 */
export function closeTestQuery(db: PostgreSQL): void {
  if (db._test_query != null) {
    clearInterval(db._test_query);
    delete db._test_query;
  }
}
