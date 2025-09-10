#!/usr/bin/env node

import { AsciiTable3 } from "ascii-table3";

import { Patterns } from "./core/patterns";
import { getSplitCacheStats, setSplitCacheEnabled } from "./core/split-cache";
import {
  clearConsistentHashCache,
  consistentHashingChoice,
  getConsistentHashCacheStats,
  setConsistentHashCacheEnabled,
} from "./core/sticky";

const ITERATIONS = 10;
const MESSAGE_COUNT = 100_000;
const PATTERN_COUNT = 1_000; // will be proportional to that number
const NS_TO_MS = 1_000_000;

// Helper functions for statistics
function calculateMean(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateStdDev(values: number[], mean: number): number {
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

function formatStat(avg: number, std: number): string {
  const relativeStd = (std / avg) * 100;
  const n = Math.round(avg).toString().padStart(6);
  if (isNaN(relativeStd) || !isFinite(relativeStd)) {
    return `${n}`.padEnd(10);
  }
  const s = Math.round(relativeStd).toString().padStart(4);
  return `${n} ±${s}%`;
}

// Generate realistic CoCalc patterns based on CLAUDE.md patterns
function generateRealisticPatterns(num: number): string[] {
  const patterns: string[] = [];

  // Generate 10000 accounts with 10 interests each
  for (let i = 0; i < num; i++) {
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
      "llm",
      "billing",
    ];

    for (const service of services) {
      patterns.push(`hub.account.${accountId}.${service}`);
    }
  }

  // Generate 10000 projects with 3 interests each
  for (let i = 0; i < num; i++) {
    const projectId = `${i
      .toString()
      .padStart(8, "0")}-proj-12d3-a456-426614174001`;
    const services = ["api", "sync"];
    const computeServices = ["terminal"];

    // Hub project patterns
    for (const service of services) {
      patterns.push(`hub.project.${projectId}.${service}`);
    }

    // Project compute patterns
    for (const service of computeServices) {
      patterns.push(`project.${projectId}.1.${service}.-`);
    }
  }

  // Additional realistic patterns (1,000 patterns)
  const additionalPatterns = [
    "time.account-*.api",
    "llm.project-*.api",
    "system.stats.>",
    "browser.session.*.sync",
    "notifications.account.*.alerts",
  ];

  for (let i = 0; i < Math.floor(num / 100); i++) {
    for (const pattern of additionalPatterns) {
      patterns.push(pattern.replace("*", `${i.toString().padStart(6, "0")}`));
    }
  }

  return patterns;
}

// Generate realistic message subjects for testing
function generateRealisticMessages(count: number): string[] {
  const messages: string[] = [];

  for (let i = 0; i < count; i++) {
    const rand = Math.random();

    if (rand < 0.7) {
      // 70% exact account/project matches
      if (Math.random() < 0.6) {
        const accountId = `${Math.floor(Math.random() * PATTERN_COUNT)
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
        const service = services[Math.floor(Math.random() * services.length)];
        messages.push(`hub.account.${accountId}.${service}`);
      } else {
        const projectId = `${Math.floor(Math.random() * PATTERN_COUNT)
          .toString()
          .padStart(8, "0")}-proj-12d3-a456-426614174001`;
        const services = ["api", "sync", "terminal"];
        const service = services[Math.floor(Math.random() * services.length)];
        if (service === "terminal") {
          messages.push(`project.${projectId}.1.${service}.-`);
        } else {
          messages.push(`hub.project.${projectId}.${service}`);
        }
      }
    } else if (rand < 0.9) {
      // 20% stream subjects (multiple matches)
      const streamId = Math.floor(Math.random() * Math.floor(PATTERN_COUNT / 100))
        .toString()
        .padStart(6, "0");
      const services = ["time", "llm", "notifications", "browser", "system"];
      const service = services[Math.floor(Math.random() * services.length)];
      messages.push(`${service}.account-${streamId}.api`);
    } else {
      // 10% completely random subjects
      const segments = Math.floor(Math.random() * 5) + 2;
      const parts: string[] = [];
      for (let j = 0; j < segments; j++) {
        parts.push(`seg${Math.floor(Math.random() * 1000)}`);
      }
      messages.push(parts.join("."));
    }
  }

  return messages;
}

function benchmark() {
  console.log("CoCalc Conat Routing Benchmark");
  console.log("===============================");

  console.log(
    `Running ${ITERATIONS} iterations with ${MESSAGE_COUNT.toLocaleString()} messages each...`,
  );
  console.log();

  // Data structures to collect results across iterations
  const variantNames = [
    "No Caching",
    "Split Cache",
    "Hash Cache",
    "Both Caches",
  ];
  const variantConfigs = [
    [false, false], // No Caching
    [true, false], // Split Cache
    [false, true], // Hash Cache
    [true, true], // Both Caches
  ];

  const results: {
    name: string;
    setupTimes: number[];
    matchTimes: number[];
    throughputs: number[];
    splitCacheHitRates: number[];
    hashCacheHitRates: number[];
  }[] = variantNames.map((name) => ({
    name,
    setupTimes: [],
    matchTimes: [],
    throughputs: [],
    splitCacheHitRates: [],
    hashCacheHitRates: [],
  }));

  // Run iterations
  for (let iter = 0; iter < ITERATIONS; iter++) {
    console.log(`Iteration ${iter + 1}/${ITERATIONS}...`);

    // Generate fresh patterns and messages for each iteration
    const patterns = generateRealisticPatterns(PATTERN_COUNT);
    const messages = generateRealisticMessages(MESSAGE_COUNT);

    // Run all 4 variants on the same data
    for (
      let variantIndex = 0;
      variantIndex < variantNames.length;
      variantIndex++
    ) {
      const [splitCacheEnabled, hashCacheEnabled] =
        variantConfigs[variantIndex];
      const result = results[variantIndex];

      // Configure caches
      setSplitCacheEnabled(splitCacheEnabled);
      setConsistentHashCacheEnabled(hashCacheEnabled);
      clearConsistentHashCache(); // Reset cache stats for accurate measurement

      const p = new Patterns<string>();

      // Setup timing
      const startSetup = process.hrtime.bigint();
      for (let i = 0; i < patterns.length; i++) {
        p.set(patterns[i], `handler-${i}`);
      }
      const endSetup = process.hrtime.bigint();
      const setupTime = Number(endSetup - startSetup) / NS_TO_MS;
      result.setupTimes.push(setupTime);

      // Create a set of fake targets for consistent hashing simulation
      const targets = new Set([
        "target1",
        "target2",
        "target3",
        "target4",
        "target5",
      ]);

      // Realistic benchmark: pattern matching + target selection (when matches found)
      const startMatch = process.hrtime.bigint();
      let totalMatches = 0;
      let totalTargetSelections = 0;
      let messagesWithMatches = 0;

      for (const message of messages) {
        // Step 1: Pattern matching (uses split cache)
        const matches = p.matches(message);
        totalMatches += matches.length;

        // Step 2: Target selection for each match (simulates realistic routing)
        if (matches.length > 0) {
          messagesWithMatches++;
          // Always use consistent hashing - caching is controlled internally
          const selectedTarget = consistentHashingChoice(targets, message);
          totalTargetSelections++;
          // Use the result to avoid optimization
          if (selectedTarget.length === 0) totalTargetSelections--;
        }
      }
      const endMatch = process.hrtime.bigint();

      // Consistency check: totalTargetSelections should equal messagesWithMatches
      if (totalTargetSelections !== messagesWithMatches) {
        console.error(
          `Consistency error in ${result.name}: totalTargetSelections=${totalTargetSelections}, messagesWithMatches=${messagesWithMatches}`,
        );
      }

      const matchTime = Number(endMatch - startMatch) / NS_TO_MS;
      const throughput = messages.length / (matchTime / 1000);

      result.matchTimes.push(matchTime);
      result.throughputs.push(throughput);

      // Get cache hit rates
      const splitStats = getSplitCacheStats();
      const splitCacheHitRate =
        splitCacheEnabled && splitStats.enabled ? splitStats.hitRate || 0 : 0;
      const hashStats = getConsistentHashCacheStats();
      const hashCacheHitRate =
        hashCacheEnabled && hashStats.enabled ? hashStats.hitRate || 0 : 0;

      result.splitCacheHitRates.push(splitCacheHitRate);
      result.hashCacheHitRates.push(hashCacheHitRate);
    }
  }

  console.log();

  // Calculate statistics and use average times for speedup calculation
  const variantAvgTimes: number[] = [];
  for (const result of results) {
    variantAvgTimes.push(calculateMean(result.matchTimes));
  }
  const baselineAvgTime = variantAvgTimes[0]; // No Caching average

  // Create results table using AsciiTable3
  const table = new AsciiTable3("Benchmark Results").setHeading(
    "Variant",
    "Setup (ms)",
    "Match (ms)",
    "Throughput",
    "Split Hit %",
    "Hash Hit %",
    "Speedup",
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const variantAvgTime = variantAvgTimes[i];

    // Calculate averages and standard deviations
    const setupMean = calculateMean(result.setupTimes);
    const setupStd = calculateStdDev(result.setupTimes, setupMean);
    const matchMean = calculateMean(result.matchTimes);
    const matchStd = calculateStdDev(result.matchTimes, matchMean);
    const throughputMean = calculateMean(result.throughputs);
    const throughputStd = calculateStdDev(result.throughputs, throughputMean);
    const splitCacheMean = calculateMean(result.splitCacheHitRates);
    const splitCacheStd = calculateStdDev(result.splitCacheHitRates, splitCacheMean);
    const hashCacheMean = calculateMean(result.hashCacheHitRates);
    const hashCacheStd = calculateStdDev(result.hashCacheHitRates, hashCacheMean);

    // Use average time for speedup calculation
    const speedup = baselineAvgTime / variantAvgTime;

    table.addRow(
      result.name,
      formatStat(setupMean, setupStd),
      formatStat(matchMean, matchStd),
      formatStat(throughputMean, throughputStd),
      formatStat(splitCacheMean, splitCacheStd),
      formatStat(hashCacheMean, hashCacheStd),
      speedup.toFixed(2),
    );
  }

  table.setStyle("unicode-round");
  console.log(table.toString());
  console.log();


  console.log(
    `✅ Completed ${ITERATIONS} iterations with ${
      ITERATIONS * 4
    } total benchmark runs`,
  );
  console.log("   All variants ran on identical data for fair comparison");
}

if (require.main === module) {
  benchmark();
}
