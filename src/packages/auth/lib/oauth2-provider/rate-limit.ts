/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Token endpoint rate limiter.
//
// Sliding window counters: per (client_id, requester IP) and global.
// Keying the per-client bucket by IP as well prevents an attacker who
// knows a valid client_id from exhausting that client's legitimate
// quota from their own IP (a cheap DoS against the real client).
// Uses LRU cache so memory is naturally bounded.

import LRU from "lru-cache";
import { process_env_int } from "@cocalc/backend/misc";

// Defaults match the values documented in this file, in provider.ts, and
// in the PR description. Override via env vars if a deployment needs more
// headroom (e.g., a CI test suite driving many clients).
const RATE_LIMIT_PER_CLIENT = process_env_int("COCALC_OAUTH2_RATE_PER_CLIENT", 2);
const RATE_LIMIT_GLOBAL = process_env_int("COCALC_OAUTH2_RATE_GLOBAL", 10);
const RATE_WINDOW_MS = 1000;

// Larger LRU because the key space is now clientId × IP.
const rateBuckets = new LRU<string, number[]>({ max: 10000 });
const GLOBAL_KEY = "__global__";

export function rateLimit(clientId: string, ip: string): string | null {
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

  // Prune and check per (client, IP) bucket.
  const perKey = `${clientId}|${ip}`;
  const clientRecent = (rateBuckets.get(perKey) ?? []).filter(
    (t) => t > cutoff,
  );
  if (clientRecent.length >= RATE_LIMIT_PER_CLIENT) {
    rateBuckets.set(perKey, clientRecent);
    return "Too many token requests for this client — try again shortly";
  }

  // Record this request
  globalRecent.push(now);
  clientRecent.push(now);
  rateBuckets.set(GLOBAL_KEY, globalRecent);
  rateBuckets.set(perKey, clientRecent);

  return null;
}
