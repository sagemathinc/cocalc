/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Token endpoint rate limiter.
//
// Sliding window counters: per-client_id (2/s) and global (10/s).
// Uses LRU cache (max 100 entries) so memory is naturally bounded.

import LRU from "lru-cache";
import { process_env_int } from "@cocalc/backend/misc";

const RATE_LIMIT_PER_CLIENT = process_env_int("COCALC_OAUTH2_RATE_PER_CLIENT", 5);
const RATE_LIMIT_GLOBAL = process_env_int("COCALC_OAUTH2_RATE_GLOBAL", 30);
const RATE_WINDOW_MS = 1000;

const rateBuckets = new LRU<string, number[]>({ max: 100 });
const GLOBAL_KEY = "__global__";

export function rateLimit(clientId: string): string | null {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  // Prune and check global
  const globalRecent = (rateBuckets.get(GLOBAL_KEY) ?? []).filter(
    (t) => t > cutoff,
  );
  if (globalRecent.length >= RATE_LIMIT_GLOBAL) {
    rateBuckets.set(GLOBAL_KEY, globalRecent);
    return "Too many token requests — try again shortly";
  }

  // Prune and check per-client
  const clientRecent = (rateBuckets.get(clientId) ?? []).filter(
    (t) => t > cutoff,
  );
  if (clientRecent.length >= RATE_LIMIT_PER_CLIENT) {
    rateBuckets.set(clientId, clientRecent);
    return "Too many token requests for this client — try again shortly";
  }

  // Record this request
  globalRecent.push(now);
  clientRecent.push(now);
  rateBuckets.set(GLOBAL_KEY, globalRecent);
  rateBuckets.set(clientId, clientRecent);

  return null;
}
