/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 3a: Throttling Operations

TypeScript implementations of in-memory throttling methods:
- throttle(db, name, time_s, ...key) - In-memory throttle with timers
- clearThrottles(db) - Clear all throttle state and cancel timers

These methods use instance properties on the db object to store throttle state.
*/

import type { PostgreSQL } from "../types";
import { to_json } from "@cocalc/util/misc";

/**
 * In-memory throttle mechanism with automatic cleanup
 *
 * Prevents repeated actions within a time window by tracking keys.
 * Returns true if throttled (already seen within window), false otherwise.
 *
 * Implementation:
 * - Stores throttle state as instance properties on the db object
 * - Uses setTimeout to automatically clear throttle after time_s seconds
 * - Supports multiple independent throttle names
 * - Supports complex keys (serialized via to_json)
 *
 * @param db - PostgreSQL database instance
 * @param name - Throttle name (allows multiple independent throttles)
 * @param time_s - Time window in seconds
 * @param key - One or more key values (will be JSON-serialized)
 * @returns true if throttled (seen before), false if not throttled (first time)
 */
export function throttle(
  db: PostgreSQL,
  name: string,
  time_s: number,
  ...key: any[]
): boolean {
  // Serialize the key arguments to a string
  const keyStr = to_json(key);

  // Property names for storing throttle state and timers
  const stateKey = `_throttle_${name}`;
  const timersKey = `_throttle_timers_${name}`;

  // Initialize state objects if they don't exist
  if (!(db as any)[stateKey]) {
    (db as any)[stateKey] = {};
  }
  if (!(db as any)[timersKey]) {
    (db as any)[timersKey] = {};
  }

  // Check if this key is already throttled
  if ((db as any)[stateKey][keyStr]) {
    return true; // Throttled
  }

  // Mark this key as throttled
  (db as any)[stateKey][keyStr] = true;

  // Set up automatic cleanup timer
  const timerId = setTimeout(() => {
    delete (db as any)[stateKey]?.[keyStr];
    delete (db as any)[timersKey]?.[keyStr];
  }, time_s * 1000);

  // Store timer ID for later cleanup
  (db as any)[timersKey][keyStr] = timerId;

  return false; // Not throttled (first time seeing this key)
}

/**
 * Clear all throttle state and cancel pending timers
 *
 * Useful for test cleanup and resetting throttle state.
 * Iterates through all properties on the db object and clears:
 * - All _throttle_* state objects
 * - All _throttle_timers_* timer objects (cancelling timers first)
 *
 * @param db - PostgreSQL database instance
 */
export function clearThrottles(db: PostgreSQL): void {
  const dbAny = db as any;

  // Iterate through all properties on the db object
  for (const key of Object.keys(dbAny)) {
    if (key.startsWith("_throttle_timers_")) {
      // Cancel all pending timers
      const timers = dbAny[key];
      for (const timerKey of Object.keys(timers)) {
        clearTimeout(timers[timerKey]);
      }
    }

    // Delete all throttle-related properties
    if (key.startsWith("_throttle_")) {
      delete dbAny[key];
    }
  }
}
