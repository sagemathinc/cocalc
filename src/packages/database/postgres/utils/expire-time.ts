/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Timestamp the given number of seconds **in the future**.
export function expire_time(ttl?: number): Date | undefined {
  if (ttl) {
    return new Date(Date.now() + ttl * 1000);
  }
  return undefined;
}
