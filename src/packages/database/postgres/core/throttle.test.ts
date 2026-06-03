/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 3a: Throttling Operations

Tests for 2 throttling methods:
- _throttle(name, time_s, ...key) - In-memory throttle mechanism with timers
- _clear_throttles() - Clear all throttle state and cancel timers

TDD Workflow:
These tests call CoffeeScript methods via db(), which will later delegate to TypeScript implementations
*/

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";

describe("Throttling Operations - Group 3a", () => {
  let database: any; // Singleton database instance

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db(); // Get the singleton
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  afterEach(() => {
    // Clean up throttle state after each test
    database._clear_throttles();
  });

  describe("_throttle - In-memory throttle mechanism", () => {
    it("returns false on first call (not throttled)", () => {
      const result = database._throttle("test", 1, "key1");
      expect(result).toBe(false);
    });

    it("returns true on second call within time window (throttled)", () => {
      database._throttle("test", 1, "key1");
      const result = database._throttle("test", 1, "key1");
      expect(result).toBe(true);
    });

    it("supports multiple keys independently", () => {
      const result1 = database._throttle("test", 1, "key1");
      const result2 = database._throttle("test", 1, "key2");
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it("supports multiple throttle names independently", () => {
      database._throttle("throttle1", 1, "key1");
      const result = database._throttle("throttle2", 1, "key1");
      expect(result).toBe(false); // Different throttle name, not throttled
    });

    it("supports complex keys (multiple arguments)", () => {
      const result1 = database._throttle("test", 1, "user1", "action1");
      const result2 = database._throttle("test", 1, "user1", "action2");
      expect(result1).toBe(false);
      expect(result2).toBe(false); // Different composite key
    });

    it("allows calls after time window expires", async () => {
      database._throttle("test", 0.05, "key1"); // 50ms throttle
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
      const result = database._throttle("test", 0.05, "key1");
      expect(result).toBe(false); // Should not be throttled anymore
    }, 10000);

    it("handles zero or very small time windows", () => {
      const result1 = database._throttle("test", 0.001, "key1");
      const result2 = database._throttle("test", 0.001, "key1");
      expect(result1).toBe(false);
      expect(result2).toBe(true); // Still throttled immediately after
    });

    it("returns consistent results for same key within window", () => {
      database._throttle("test", 1, "key1");
      const result1 = database._throttle("test", 1, "key1");
      const result2 = database._throttle("test", 1, "key1");
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe("_clear_throttles - Clear all throttle state", () => {
    it("clears throttle state", () => {
      database._throttle("test", 10, "key1");
      database._clear_throttles();
      const result = database._throttle("test", 10, "key1");
      expect(result).toBe(false); // Not throttled after clear
    });

    it("cancels pending timers", async () => {
      database._throttle("test", 0.1, "key1"); // 100ms throttle
      database._clear_throttles();
      // Wait for what would have been the timer expiration
      await new Promise((resolve) => setTimeout(resolve, 150));
      const result = database._throttle("test", 0.1, "key1");
      expect(result).toBe(false); // Should work since timers were cleared
    }, 10000);

    it("clears multiple throttle names", () => {
      database._throttle("throttle1", 10, "key1");
      database._throttle("throttle2", 10, "key2");
      database._clear_throttles();
      const result1 = database._throttle("throttle1", 10, "key1");
      const result2 = database._throttle("throttle2", 10, "key2");
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it("can be called multiple times safely", () => {
      database._throttle("test", 10, "key1");
      database._clear_throttles();
      database._clear_throttles(); // Should not throw
      expect(() => database._clear_throttles()).not.toThrow();
    });

    it("works when no throttles exist", () => {
      expect(() => database._clear_throttles()).not.toThrow();
    });
  });
});
