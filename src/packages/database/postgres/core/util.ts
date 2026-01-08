/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 1: Database Utilities - Core utility methods for PostgreSQL class

TypeScript implementations of 8 utility methods:
- _dbg(f) - Debug logger factory
- _init_metrics() - Initialize Prometheus metrics
- concurrent() - Get concurrent query count
- is_heavily_loaded() - Check if heavily loaded
- sha1(...args) - Generate SHA1 hash
- sanitize(s) - Escape string for SQL
- clear_cache() - Clear LRU cache
- engine() - Return 'postgresql'
*/

// @ts-ignore - No type definitions available for sql-string-escape
import escapeString from "sql-string-escape";

import {
  pgdatabase,
  pghost,
  pgssl,
  pguser,
  type SSLConfig,
} from "@cocalc/backend/data";
import { getLogger } from "@cocalc/backend/logger";
import * as metrics from "@cocalc/backend/metrics";
import { sha1 } from "@cocalc/backend/misc_node";
import dbPassword from "@cocalc/database/pool/password";
import { trunc_middle } from "@cocalc/util/misc";

import type { PostgreSQL } from "@cocalc/database/postgres/types";

const winston = getLogger("postgres");

/**
 * Debug logger factory - creates a debug logging function for a specific method
 *
 * @param db - PostgreSQL database instance
 * @param f - Method/function name for the debug context
 * @returns Debug logging function that logs with method name prefix
 */
export function dbg(db: PostgreSQL, f: string): Function {
  if (db._debug) {
    return (m: any) =>
      winston.debug(`PostgreSQL.${f}: ${trunc_middle(JSON.stringify(m), 250)}`);
  } else {
    return () => {}; // No-op function when debug is disabled
  }
}

/**
 * Initialize Prometheus metrics for database monitoring
 *
 * Creates two metrics:
 * - query_time_histogram: Tracks query execution time distribution
 * - concurrent_counter: Tracks concurrent query counts (started/finished)
 *
 * @param db - PostgreSQL database instance
 */
export function initMetrics(db: PostgreSQL): void {
  try {
    db.query_time_histogram = metrics.newHistogram(
      "db",
      "query_ms_histogram",
      "db queries",
      {
        buckets: [1, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 10000],
        labels: ["table"],
      },
    );
    db.concurrent_counter = metrics.newCounter(
      "db",
      "concurrent_total",
      "Concurrent queries (started and finished)",
      ["state"],
    );
  } catch (err) {
    const dbgFn = dbg(db, "_init_metrics");
    dbgFn(`WARNING -- ${err}`);
  }
}

/**
 * Get current concurrent query count
 *
 * @param db - PostgreSQL database instance
 * @returns Number of currently executing queries (0 if not tracked)
 */
export function concurrent(db: PostgreSQL): number {
  return (db as any)._concurrent_queries ?? 0;
}

/**
 * Check if database is heavily loaded
 *
 * Compares current concurrent queries against the configured threshold
 *
 * @param db - PostgreSQL database instance
 * @returns true if concurrent queries >= heavy load threshold, false otherwise
 */
export function isHeavilyLoaded(db: PostgreSQL): boolean {
  const currentQueries = (db as any)._concurrent_queries ?? 0;
  const threshold = (db as any)._concurrent_heavily_loaded ?? 70;
  return currentQueries >= threshold;
}

/**
 * Generate SHA1 hash from input arguments
 *
 * Concatenates all arguments (converting objects to JSON) and returns SHA1 hash.
 * Used for computing compound primary keys and cache keys.
 *
 * @param args - Variable number of arguments (strings or objects)
 * @returns 40-character hexadecimal SHA1 hash
 */
export function sha1Hash(...args: any[]): string {
  const concatenated = args
    .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
    .join("");
  return sha1(concatenated);
}

/**
 * Sanitize string for SQL injection prevention
 *
 * Uses sql-string-escape library to safely escape strings for SQL queries.
 * Escapes single quotes using PostgreSQL standard (doubled quotes).
 *
 * @param s - String to sanitize
 * @returns Escaped string safe for SQL inclusion
 */
export function sanitize(s: string): string {
  return escapeString(s);
}

/**
 * Clear LRU query cache
 *
 * Clears all cached query results to free memory or force fresh queries.
 *
 * @param db - PostgreSQL database instance
 */
export function clearCache(db: PostgreSQL): void {
  (db as any)._query_cache?.clear();
}

/**
 * Return database engine identifier
 *
 * @returns 'postgresql' identifier string
 */
export function engine(): string {
  return "postgresql";
}

type PgConnectionInfo = {
  database: string;
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  ssl: SSLConfig;
};

export function getPgConnectionInfo(): PgConnectionInfo {
  const hostEntry = pghost;
  const isSocket = hostEntry.includes("/");
  if (isSocket) {
    return {
      database: pgdatabase,
      host: hostEntry,
      port: 5432,
      user: pguser,
      password: dbPassword(),
      ssl: pgssl,
    };
  }
  if (hostEntry.includes(":")) {
    const [host, portStr] = hostEntry.split(":");
    const parsedPort = Number.parseInt(portStr ?? "", 10);
    return {
      database: pgdatabase,
      host,
      port: Number.isFinite(parsedPort) ? parsedPort : 5432,
      user: pguser,
      password: dbPassword(),
      ssl: pgssl,
    };
  }
  return {
    database: pgdatabase,
    host: hostEntry,
    port: 5432,
    user: pguser,
    password: dbPassword(),
    ssl: pgssl,
  };
}
