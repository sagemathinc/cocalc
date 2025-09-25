import ConsistentHash from "consistent-hash";
import LRU from "lru-cache";

import { getLogger } from "@cocalc/conat/client";
import { hash_string } from "@cocalc/util/misc";
import { splitSubject } from "./split-cache";

const logger = getLogger("conat:consistent-hash-cache");

// Cache configuration
export const CONSISTENT_HASH_CACHE_SIZE_DEFAULT = 10_000;

const CONSISTENT_HASH_CACHE_SIZE: number = parseInt(
  process.env.COCALC_CONAT_CONSISTENT_HASH_CACHE_SIZE ??
    `${CONSISTENT_HASH_CACHE_SIZE_DEFAULT}`,
);

// Global flag for consistent hash cache enabled state
let consistentHashCacheEnabled: boolean =
  process.env.COCALC_CONAT_CONSISTENT_HASH_CACHE_ENABLED?.toLowerCase() ===
  "true";

// LRU cache for consistent hashing results
// Key: hash of (sorted targets + resource)
// Value: chosen target
let consistentHashCache: LRU<string, string> | null = null;
let cacheStats = { hits: 0, misses: 0 };

function getCache(): LRU<string, string> | null {
  if (!consistentHashCacheEnabled) {
    return null;
  }

  if (!consistentHashCache) {
    consistentHashCache = new LRU<string, string>({
      max: CONSISTENT_HASH_CACHE_SIZE,
    });
    logger.debug(
      `Initialized consistent hash cache with ${CONSISTENT_HASH_CACHE_SIZE} entries`,
    );
  }

  return consistentHashCache;
}

function getCacheKey(targets: Set<string>, resource: string): string {
  // Sort targets for consistent cache keys regardless of Set order
  const sortedTargets = Array.from(targets).sort().join(",");
  return `${sortedTargets}|${resource}`;
}

export function consistentHashingChoice(
  v: Set<string>,
  resource: string,
): string {
  if (v.size == 0) {
    throw Error("v must have size at least 1");
  }
  if (v.size == 1) {
    for (const x of v) {
      return x;
    }
  }

  // Check cache first
  const cache = getCache();
  if (cache) {
    const cacheKey = getCacheKey(v, resource);
    const cached = cache.get(cacheKey);
    if (cached !== undefined && v.has(cached)) {
      cacheStats.hits++;
      return cached;
    }
    cacheStats.misses++;
  }

  // Cache miss or caching disabled - compute the expensive consistent hash
  const hr = new ConsistentHash({ distribution: "uniform" });
  const w = Array.from(v);
  w.sort();
  for (const x of w) {
    hr.add(x);
  }
  // we hash the resource so that the values are randomly distributed even
  // if the resources look very similar (e.g., subject.1, subject.2, etc.)
  // I thought that "consistent-hash" hashed the resource, but it doesn't really.
  const result = hr.get(hash_string(resource));

  // Store in cache if enabled
  if (cache) {
    const cacheKey = getCacheKey(v, resource);
    cache.set(cacheKey, result);
  }

  return result;
}

/**
 * Get statistics about consistent hash cache performance
 */
export function getConsistentHashCacheStats() {
  const cache = getCache();
  if (!cache) {
    return {
      enabled: false,
      message: "Consistent hash cache is disabled",
    };
  }

  const total = cacheStats.hits + cacheStats.misses;
  return {
    enabled: true,
    size: cache.size,
    maxSize: cache.max,
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate: total > 0 ? (cacheStats.hits / total) * 100 : 0,
    utilization: (cache.size / cache.max) * 100,
  };
}

/**
 * Clear the consistent hash cache (useful for testing)
 */
export function clearConsistentHashCache() {
  if (consistentHashCache) {
    consistentHashCache.clear();
  }
  // Reset cache instance to force re-initialization with current env vars
  consistentHashCache = null;
  cacheStats = { hits: 0, misses: 0 };
}

/**
 * Set the consistent hash cache enabled state (useful for testing)
 */
export function setConsistentHashCacheEnabled(enabled: boolean) {
  consistentHashCacheEnabled = enabled;
  // Clear existing cache when toggling to ensure clean state
  if (consistentHashCache) {
    consistentHashCache.clear();
    consistentHashCache = null;
  }
  cacheStats = { hits: 0, misses: 0 };
}

export function stickyChoice({
  subject,
  pattern,
  targets,
  updateSticky,
  getStickyTarget,
}: {
  subject: string;
  pattern: string;
  targets: Set<string>;
  updateSticky?;
  getStickyTarget: (opts: {
    pattern: string;
    subject: string;
    targets: Set<string>;
  }) => string | undefined;
}) {
  const v = splitSubject(subject);
  subject = v.slice(0, v.length - 1).join(".");
  const currentTarget = getStickyTarget({ pattern, subject, targets });
  if (currentTarget === undefined || !targets.has(currentTarget)) {
    // we use consistent hashing instead of random to make the choice, because if
    // choice is being made by two different socketio servers at the same time,
    // and they make different choices, it would be (temporarily) bad since a
    // couple messages could get routed inconsistently.
    // It's actually very highly likely to have such parallel choices
    // happening in cocalc, since when a file is opened a persistent stream is opened
    // in the browser and the project at the exact same time, and those are likely
    // to be connected to different socketio servers.  By using consistent hashing,
    // all conflicts are avoided except for a few moments when the actual targets
    // (e.g., the persist servers) are themselves changing, which should be something
    // that only happens for a moment every few days.
    const target = consistentHashingChoice(targets, subject);
    updateSticky?.({ pattern, subject, target });
    return target;
  }
  return currentTarget;
}
