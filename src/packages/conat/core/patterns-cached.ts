/**
 * CacheStringSplits Pattern Matching Optimization
 *
 * Only optimizes the single biggest bottleneck: string splitting
 * Uses an LRU cache for subject.split(".") calls without other overhead
 */

import LRU from "lru-cache";
import { Patterns } from "./patterns";

export const SPLIT_CACHE_SIZE_DEFAULT = 100_000;

const SPLIT_CACHE_SIZE: number = parseInt(
  process.env.COCALC_CONAT_SPLIT_CACHE_SIZE ?? `${SPLIT_CACHE_SIZE_DEFAULT}`,
);

// LRU string split cache - memoizes subject.split(".") calls
// When matching "hub.account.123.api", avoids re-splitting the same string
// by caching the result ["hub", "account", "123", "api"] for future use
// Uses LRU eviction when cache is full
class SplitCache {
  private cache: LRU<string, string[]>;

  constructor(maxSize: number) {
    this.cache = new LRU<string, string[]>({ max: maxSize });
  }

  split(subject: string): string[] {
    const cached = this.cache.get(subject);
    if (cached !== undefined) {
      return cached;
    }

    const segments = subject.split(".");
    this.cache.set(subject, segments);
    return segments;
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      utilization: (this.cache.size / this.cache.max) * 100,
    };
  }
}

export class CacheStringSplitsPatterns<T> extends Patterns<T> {
  private splitCache: SplitCache;

  constructor(
    options: { splitCacheSize: number } = { splitCacheSize: SPLIT_CACHE_SIZE },
  ) {
    super();
    this.splitCache = new SplitCache(options.splitCacheSize);
  }

  // Override matches method to use cached splitting
  matches = (subject: string): string[] => {
    // Use cached split instead of subject.split(".")
    const subjectSegments = this.splitCache.split(subject);
    return this.matchUsingIndexWithSegments(this.index, subjectSegments);
  };

  // Direct copy of matchUsingIndex but accepts pre-split segments
  private matchUsingIndexWithSegments(
    index: any,
    segments: string[],
    atMostOne = false,
  ): string[] {
    if (segments.length == 0) {
      const p = index[""];
      if (p === undefined) {
        return [];
      } else if (typeof p === "string") {
        return [p];
      } else {
        throw Error("bug");
      }
    }
    const matches: string[] = [];
    const subject = segments[0];
    for (const pattern of ["*", ">", subject]) {
      if (index[pattern] !== undefined) {
        const p = index[pattern];
        if (typeof p == "string") {
          // end of this pattern -- matches if segments also
          // stops *or* this pattern is >
          if (segments.length === 1) {
            matches.push(p);
            if (atMostOne) {
              return matches;
            }
          } else if (pattern === ">") {
            matches.push(p);
            if (atMostOne) {
              return matches;
            }
          }
        } else {
          for (const s of this.matchUsingIndexWithSegments(
            p,
            segments.slice(1),
            atMostOne,
          )) {
            matches.push(s);
            if (atMostOne) {
              return matches;
            }
          }
        }
      }
    }
    return matches;
  }

  // Override hasMatch with cached splitting
  hasMatch = (subject: string): boolean => {
    const subjectSegments = this.splitCache.split(subject);
    return (
      this.matchUsingIndexWithSegments(this.index, subjectSegments, true)
        .length > 0
    );
  };

  // Get cache statistics
  getCacheStats() {
    return {
      patterns: Object.keys(this.patterns).length,
      splitCache: this.splitCache.getStats(),
    };
  }

  // Clear cache
  clearCaches(): void {
    this.splitCache.clear();
  }
}

export default CacheStringSplitsPatterns;
