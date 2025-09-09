#!/usr/bin/env node

import { Patterns } from "./patterns";
import { CacheStringSplitsPatterns } from "./patterns-cached";

const MESSAGE_COUNT = 1_000_000;
const NS_TO_MS = 1_000_000;

// Generate realistic CoCalc patterns based on CLAUDE.md patterns
function generateRealisticPatterns(): string[] {
  const patterns: string[] = [];

  // Generate 8000 accounts with 10 interests each (80,000 patterns)
  for (let i = 0; i < 8000; i++) {
    const accountId = `${i.toString().padStart(8, "0")}-e89b-12d3-a456-426614174000`;
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

  // Generate 7000 projects with 3 interests each (21,000 patterns)
  for (let i = 0; i < 7000; i++) {
    const projectId = `${i.toString().padStart(8, "0")}-proj-12d3-a456-426614174001`;
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

  for (let i = 0; i < 200; i++) {
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
        const accountId = `${Math.floor(Math.random() * 1000)
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
        const projectId = `${Math.floor(Math.random() * 1000)
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
      const streamId = Math.floor(Math.random() * 100)
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
  console.log("Generating realistic patterns...");
  const patterns = generateRealisticPatterns();
  console.log(`Generated ${patterns.length} patterns`);

  console.log(`Generating ${MESSAGE_COUNT.toLocaleString()} test messages...`);
  const messages = generateRealisticMessages(MESSAGE_COUNT);
  console.log(`Generated ${messages.length} messages`);

  // Test original patterns
  console.log("\n=== Testing Original Patterns ===");
  const originalPatterns = new Patterns<string>();
  console.log(`Original class: ${originalPatterns.constructor.name}`);

  console.log("Adding patterns to original implementation...");
  const startSetupOriginal = process.hrtime.bigint();
  for (let i = 0; i < patterns.length; i++) {
    originalPatterns.set(patterns[i], `handler-${i}`);
  }
  const endSetupOriginal = process.hrtime.bigint();
  const setupTimeOriginal =
    Number(endSetupOriginal - startSetupOriginal) / NS_TO_MS;

  console.log("Benchmarking original pattern matching...");
  const startOriginal = process.hrtime.bigint();
  let originalMatches = 0;
  for (const message of messages) {
    const matches = originalPatterns.matches(message);
    originalMatches += matches.length;
  }
  const endOriginal = process.hrtime.bigint();
  const timeOriginal = Number(endOriginal - startOriginal) / NS_TO_MS;

  // Test optimized patterns
  console.log("\n=== Testing CacheStringSplits Patterns ===");
  const optimizedPatterns = new CacheStringSplitsPatterns<string>();
  console.log(`Optimized class: ${optimizedPatterns.constructor.name}`);

  console.log("Adding patterns to optimized implementation...");
  const startSetupOptimized = process.hrtime.bigint();
  for (let i = 0; i < patterns.length; i++) {
    optimizedPatterns.set(patterns[i], `handler-${i}`);
  }
  const endSetupOptimized = process.hrtime.bigint();
  const setupTimeOptimized =
    Number(endSetupOptimized - startSetupOptimized) / NS_TO_MS;

  console.log("Benchmarking optimized pattern matching...");
  const startOptimized = process.hrtime.bigint();
  let optimizedMatches = 0;
  for (const message of messages) {
    const matches = optimizedPatterns.matches(message);
    optimizedMatches += matches.length;
  }
  const endOptimized = process.hrtime.bigint();
  const timeOptimized = Number(endOptimized - startOptimized) / NS_TO_MS;

  // Results
  console.log("\n=== RESULTS ===");
  console.log(`Patterns: ${patterns.length}`);
  console.log(`Messages: ${messages.length.toLocaleString()}`);
  console.log();

  console.log("Setup Performance:");
  console.log(`  Original:  ${setupTimeOriginal.toFixed(2)}ms`);
  console.log(`  Optimized: ${setupTimeOptimized.toFixed(2)}ms`);
  console.log(
    `  Setup speedup: ${(setupTimeOriginal / setupTimeOptimized).toFixed(2)}x`,
  );
  console.log();

  console.log("Pattern Matching Performance:");
  console.log(
    `  Original:  ${timeOriginal.toFixed(2)}ms (${originalMatches.toLocaleString()} matches)`,
  );
  console.log(
    `  Optimized: ${timeOptimized.toFixed(2)}ms (${optimizedMatches.toLocaleString()} matches)`,
  );
  console.log(
    `  Speedup: ${(timeOriginal / timeOptimized).toFixed(2)}x (${(((timeOriginal - timeOptimized) / timeOriginal) * 100).toFixed(1)}% improvement)`,
  );
  console.log();

  console.log("Throughput:");
  console.log(
    `  Original:  ${(messages.length / (timeOriginal / 1000)).toLocaleString()} messages/sec`,
  );
  console.log(
    `  Optimized: ${(messages.length / (timeOptimized / 1000)).toLocaleString()} messages/sec`,
  );

  // Cache statistics for optimized version
  const stats = optimizedPatterns.getCacheStats?.();
  if (stats) {
    console.log("\nCache Performance (Optimized):");
    console.log(
      `  Split Cache: ${stats.splitCache.size}/${stats.splitCache.maxSize} entries (${stats.splitCache.utilization.toFixed(1)}% utilization)`,
    );
  }

  // Verify correctness
  if (originalMatches !== optimizedMatches) {
    console.log(
      `\n⚠️  WARNING: Match count mismatch! Original: ${originalMatches}, Optimized: ${optimizedMatches}`,
    );
  } else {
    console.log(
      `\n✅ Correctness verified: Both implementations found ${originalMatches.toLocaleString()} matches`,
    );
  }
}

if (require.main === module) {
  benchmark();
}
