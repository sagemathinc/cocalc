import LRU from "lru-cache";

export const SPLIT_CACHE_SIZE_DEFAULT = 100_000;

const SPLIT_CACHE_SIZE: number = parseInt(
  process.env.COCALC_CONAT_SPLIT_CACHE_SIZE ?? `${SPLIT_CACHE_SIZE_DEFAULT}`,
);

// Global LRU cache for string.split(".") operations
// This optimizes performance by avoiding repeated splitting of the same strings
let splitCache: LRU<string, string[]> | null = null;
let cacheStats = { hits: 0, misses: 0 };

// Global flag for split cache enabled state
let splitCacheEnabled: boolean =
  process.env.COCALC_CONAT_SPLIT_CACHE_ENABLED?.toLowerCase() !== "false"; // Default to true

function getSplitCache(): LRU<string, string[]> | null {
  if (!splitCacheEnabled) {
    return null;
  }

  if (!splitCache) {
    splitCache = new LRU<string, string[]>({ max: SPLIT_CACHE_SIZE });
  }

  return splitCache;
}

/**
 * Optimized string splitting on "." with global LRU caching
 * Falls back to regular string.split(".") if caching is disabled
 */
export function splitSubject(subject: string): string[] {
  const cache = getSplitCache();
  if (!cache) {
    return subject.split(".");
  }

  const cached = cache.get(subject);
  if (cached !== undefined) {
    cacheStats.hits++;
    return cached;
  }

  cacheStats.misses++;
  const segments = subject.split(".");
  cache.set(subject, segments);
  return segments;
}

/**
 * Set the split cache enabled state (useful for testing)
 */
export function setSplitCacheEnabled(enabled: boolean) {
  splitCacheEnabled = enabled;
  // Clear existing cache when toggling
  if (splitCache) {
    splitCache.clear();
    splitCache = null;
  }
  cacheStats = { hits: 0, misses: 0 };
}

/**
 * Clear the split cache
 */
export function clearSplitCache() {
  if (splitCache) {
    splitCache.clear();
  }
  cacheStats = { hits: 0, misses: 0 };
}

/**
 * Get split cache statistics
 */
export function getSplitCacheStats() {
  const cache = getSplitCache();
  if (!cache) {
    return {
      enabled: false,
      message: "Split cache is disabled",
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
