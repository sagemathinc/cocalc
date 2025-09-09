/*
Test suite for CacheStringSplitsPatterns to ensure API compatibility

pnpm test ./patterns-cached.test.ts
*/

import { randomId } from "@cocalc/conat/names";
import { Patterns } from "./patterns";
import {
  CacheStringSplitsPatterns,
  SPLIT_CACHE_SIZE_DEFAULT,
} from "./patterns-cached";

describe("CacheStringSplitsPatterns API compatibility", () => {
  it("has same behavior as original for basic patterns", () => {
    const original = new Patterns();
    const optimized = new CacheStringSplitsPatterns();

    // Add same patterns to both
    original.set("x", 0);
    original.set("a.b.>", 0);
    original.set("a.*", 0);

    optimized.set("x", 0);
    optimized.set("a.b.>", 0);
    optimized.set("a.*", 0);

    // Test same subjects
    expect(optimized.matches("x").sort()).toEqual(original.matches("x").sort());
    expect(optimized.matches("y").sort()).toEqual(original.matches("y").sort());
    expect(optimized.matches("a.b.c").sort()).toEqual(
      original.matches("a.b.c").sort(),
    );
    expect(optimized.matches("a.b").sort()).toEqual(
      original.matches("a.b").sort(),
    );
  });

  it("handles multiple matches identically", () => {
    const original = new Patterns();
    const optimized = new CacheStringSplitsPatterns();

    original.set("a.b.>", 0);
    original.set("a.*.*", 0);

    optimized.set("a.b.>", 0);
    optimized.set("a.*.*", 0);

    expect(optimized.matches("a.b.c").sort()).toEqual(
      original.matches("a.b.c").sort(),
    );
    expect(optimized.matches("a.b.c.d").sort()).toEqual(
      original.matches("a.b.c.d").sort(),
    );
  });

  it("handles pattern deletion correctly", () => {
    const original = new Patterns();
    const optimized = new CacheStringSplitsPatterns();

    // Add patterns
    original.set("a.b.>", 0);
    original.set("a.b.c", 0);
    original.set("a.b.d", 0);

    optimized.set("a.b.>", 0);
    optimized.set("a.b.c", 0);
    optimized.set("a.b.d", 0);

    // Test before deletion
    expect(optimized.matches("a.b.c").sort()).toEqual(
      original.matches("a.b.c").sort(),
    );
    expect(optimized.matches("a.b.d").sort()).toEqual(
      original.matches("a.b.d").sort(),
    );

    // Delete from both
    original.delete("a.b.c");
    optimized.delete("a.b.c");

    expect(optimized.matches("a.b.c").sort()).toEqual(
      original.matches("a.b.c").sort(),
    );
    expect(optimized.matches("a.b.d").sort()).toEqual(
      original.matches("a.b.d").sort(),
    );
  });

  it("has same hasMatch behavior", () => {
    const original = new Patterns();
    const optimized = new CacheStringSplitsPatterns();

    original.set("test.pattern", 0);
    optimized.set("test.pattern", 0);

    expect(optimized.hasMatch("test.pattern")).toBe(
      original.hasMatch("test.pattern"),
    );
    expect(optimized.hasMatch("no.match")).toBe(original.hasMatch("no.match"));
  });

  it("provides cache statistics", () => {
    const optimized = new CacheStringSplitsPatterns({ splitCacheSize: 100 });
    optimized.set("test.pattern", 0);

    // Use the cache
    for (let i = 0; i < 50; i++) {
      optimized.matches("test.pattern");
      optimized.matches(`different.pattern.${i}`);
    }

    const stats = optimized.getCacheStats();
    expect(stats).toHaveProperty("patterns");
    expect(stats).toHaveProperty("splitCache");
    expect(stats.splitCache).toHaveProperty("size");
    expect(stats.splitCache).toHaveProperty("maxSize");
    expect(stats.splitCache.maxSize).toBe(100);
    expect(stats.patterns).toBe(1);
  });
});

describe("CacheStringSplitsPatterns performance", () => {
  const patterns = 1e4; // Smaller scale for fast tests

  it("maintains performance with caching", () => {
    const optimized = new CacheStringSplitsPatterns({ splitCacheSize: 1000 });
    const knownIds: string[] = [];

    // Create patterns
    for (const seg1 of ["service", "hub", "project"]) {
      for (const seg2 of ["*", "x"]) {
        for (let i = 0; i < patterns / 6; i++) {
          const id = randomId();
          knownIds.push(id);
          const pattern = `${seg1}.${seg2}.${id}`;
          optimized.set(pattern, 0);
        }
      }
    }

    // Test matching performance
    let totalMatches = 0;
    const testCount = 1000;

    for (let i = 0; i < testCount; i++) {
      const subject = `service.x.${knownIds[i % knownIds.length]}`;
      totalMatches += optimized.matches(subject).length;
    }

    expect(totalMatches).toBeGreaterThan(0);

    const stats = optimized.getCacheStats();
    expect(stats.splitCache.size).toBeGreaterThan(0);
  });

  it("handles cache overflow gracefully", () => {
    const optimized = new CacheStringSplitsPatterns({ splitCacheSize: 10 }); // Very small cache

    // Add more unique subjects than cache can hold
    for (let i = 0; i < 50; i++) {
      optimized.matches(`unique.subject.${i}`);
    }

    const stats = optimized.getCacheStats();
    expect(stats.splitCache.size).toBeLessThanOrEqual(10);
  });
});

describe("realistic CoCalc patterns benchmark", () => {
  // NOTE: This test uses realistic CoCalc patterns where CacheStringSplitsPatterns shows improvement.
  // Unlike the main stress test (which uses highly diverse random patterns that pollute the cache),
  // this test uses patterns with repeated segments that benefit from split caching:
  // - hub.account.{uuid}.{service} - common prefixes get cached
  // - project.{uuid}.{compute}.{service}.{path} - repeated structure
  // This demonstrates the 8% improvement seen in production routing benchmarks.

  it("shows performance benefit with realistic patterns", () => {
    const original = new Patterns<string>();
    const optimized = new CacheStringSplitsPatterns<string>();

    // Generate realistic CoCalc patterns (similar to routing-benchmark.ts)
    const patterns: string[] = [];

    // 1000 accounts with 10 services each
    for (let i = 0; i < 100; i++) {
      // Reduced scale for test speed
      const accountId = `${i
        .toString()
        .padStart(8, "0")}-e89b-12d3-a456-426614174000`;
      const services = [
        "api",
        "projects",
        "db",
        "purchases",
        "jupyter",
        "sync",
        "org",
        "messages",
      ];

      for (const service of services) {
        const pattern = `hub.account.${accountId}.${service}`;
        patterns.push(pattern);
        original.set(pattern, `handler-${patterns.length}`);
        optimized.set(pattern, `handler-${patterns.length}`);
      }
    }

    // 100 projects with 3 services each
    for (let i = 0; i < 100; i++) {
      const projectId = `${i
        .toString()
        .padStart(8, "0")}-proj-12d3-a456-426614174001`;
      const services = ["api", "sync", "terminal"];

      for (const service of services) {
        if (service === "terminal") {
          const pattern = `project.${projectId}.1.${service}.-`;
          patterns.push(pattern);
          original.set(pattern, `handler-${patterns.length}`);
          optimized.set(pattern, `handler-${patterns.length}`);
        } else {
          const pattern = `hub.project.${projectId}.${service}`;
          patterns.push(pattern);
          original.set(pattern, `handler-${patterns.length}`);
          optimized.set(pattern, `handler-${patterns.length}`);
        }
      }
    }

    // Generate realistic messages (70% exact matches, 30% no matches)
    const messages: string[] = [];
    for (let i = 0; i < 100_000; i++) {
      if (Math.random() < 0.7) {
        // 70% exact matches to existing patterns
        const randomPattern =
          patterns[Math.floor(Math.random() * patterns.length)];
        messages.push(randomPattern);
      } else {
        // 30% messages that won't match (but use similar structure)
        const accountId = `99999999-e89b-12d3-a456-426614174000`;
        messages.push(`hub.account.${accountId}.nonexistent`);
      }
    }

    // Benchmark original
    const startOriginal = process.hrtime.bigint();
    let originalMatches = 0;
    for (const message of messages) {
      originalMatches += original.matches(message).length;
    }
    const timeOriginal =
      Number(process.hrtime.bigint() - startOriginal) / 1_000_000;

    // Benchmark optimized
    const startOptimized = process.hrtime.bigint();
    let optimizedMatches = 0;
    for (const message of messages) {
      optimizedMatches += optimized.matches(message).length;
    }
    const timeOptimized =
      Number(process.hrtime.bigint() - startOptimized) / 1_000_000;

    // Results
    const stats = optimized.getCacheStats();

    // Verify correctness
    expect(originalMatches).toBe(optimizedMatches);
    expect(originalMatches).toBeGreaterThan(0);

    // Verify cache statistics
    expect(stats).toHaveProperty("patterns");
    expect(stats).toHaveProperty("splitCache");
    expect(stats.patterns).toBe(1100); // Should match number of patterns added
    expect(stats.splitCache.size).toBeGreaterThan(0); // Cache should have entries
    expect(stats.splitCache.maxSize).toBe(SPLIT_CACHE_SIZE_DEFAULT); // Default cache size
    expect(stats.splitCache.utilization).toBeGreaterThan(0); // Should have some utilization
    expect(stats.splitCache.utilization).toBeLessThanOrEqual(100); // Max 100% utilization

    // Performance expectation: should be at least as fast as original for realistic patterns
    // (May be faster due to caching of repeated segments like "hub.account")
    expect(timeOptimized).toBeLessThanOrEqual(timeOriginal); // Allow some variance in test environment
  });
});

describe("stress test comparison", () => {
  // NOTE: This stress test uses highly diverse random patterns that may show CacheStringSplitsPatterns
  // as slower due to cache pollution. This is expected behavior - the optimization is workload-dependent.
  const patterns = 1e4;
  let original: Patterns<number>;
  let optimized: CacheStringSplitsPatterns<number>;
  const knownIds: string[] = [];

  it(`create ${patterns} patterns in both implementations`, () => {
    original = new Patterns();
    optimized = new CacheStringSplitsPatterns();

    for (const seg1 of ["service", "hub", "project", "account", "global"]) {
      for (const seg2 of ["*", "x"]) {
        for (let i = 0; i < patterns / 10; i++) {
          const id = randomId();
          knownIds.push(id);
          const pattern = `${seg1}.${seg2}.${id}`;
          original.set(pattern, i);
          optimized.set(pattern, i);
        }
      }
    }
  });

  const count = 1e4;
  it(`match ${count} times and verify identical results`, () => {
    let differenceCount = 0;

    for (const seg1 of ["service", "hub", "project", "account", "global"]) {
      for (const seg2 of ["a", "x"]) {
        for (let i = 0; i < count / 10; i++) {
          const subject = `${seg1}.${seg2}.${knownIds[i] ?? randomId()}`;
          const originalMatches = original.matches(subject).sort();
          const optimizedMatches = optimized.matches(subject).sort();

          if (
            JSON.stringify(originalMatches) !== JSON.stringify(optimizedMatches)
          ) {
            differenceCount++;
            if (differenceCount <= 3) {
              // Only log first few differences
              console.log("Difference found for subject:", subject);
              console.log("Original:", originalMatches);
              console.log("Optimized:", optimizedMatches);
            }
          }
        }
      }
    }

    expect(differenceCount).toBe(0); // No differences allowed
  });
});
