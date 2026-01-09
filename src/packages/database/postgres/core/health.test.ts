/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Test Query & Health Monitoring - Group 4

Tests for health monitoring methods that use periodic test queries
to ensure database connection is working:
- _init_test_query() - Initialize periodic health check
- _close_test_query() - Stop health check interval
- _do_test_query() - Execute health check query

These tests target the CoffeeScript class via db() to validate
existing behavior before TypeScript migration.
*/

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";

describe("Health Monitoring - Group 4", () => {
  let database: ReturnType<typeof db>;

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db();
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  const runTestQuery = async (): Promise<{
    opts: any;
    err: any;
    result: any;
  }> => {
    const originalQuery = database._query;
    return await new Promise((resolve) => {
      database._query = function (opts: any) {
        const originalCb = opts.cb;
        opts.cb = (err: any, result: any) => {
          database._query = originalQuery;
          if (originalCb) {
            originalCb(err, result);
          }
          resolve({ opts, err, result });
        };
        return originalQuery.call(this, opts);
      };

      database._do_test_query();
    });
  };

  const runWithTestQueryEnabled = async <T>(
    fn: () => Promise<T> | T,
  ): Promise<T> => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalWorkerId = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = "production";
    try {
      return await fn();
    } finally {
      if (originalWorkerId != null) {
        process.env.JEST_WORKER_ID = originalWorkerId;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
      if (originalNodeEnv != null) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (database._test_query) {
        clearInterval(database._test_query);
        delete database._test_query;
      }
    }
  };

  describe("_do_test_query - Execute health check", () => {
    it("executes a simple SELECT NOW() query", async () => {
      const { opts } = await runTestQuery();

      expect(opts).toBeDefined();
      expect(opts.query).toBe("SELECT NOW()");
      expect(opts.cb).toBeDefined();
    }, 10000);

    it("completes without error", async () => {
      const { err, result } = await runTestQuery();

      expect(err == null || err === undefined).toBe(true);
      expect(result).toBeDefined();
    }, 10000);
  });

  describe("_init_test_query - Initialize periodic health check", () => {
    afterEach(() => {
      // Clean up any test query interval after each test
      if (database._test_query) {
        clearInterval(database._test_query);
        delete database._test_query;
      }
    });

    it("does nothing if _timeout_ms is not set", () => {
      const originalTimeoutMs = database._timeout_ms;

      // Close any existing test query first
      database._close_test_query();

      database._timeout_ms = undefined;

      // Should not create interval
      database._init_test_query();

      expect(database._test_query).toBeUndefined();

      // Restore
      database._timeout_ms = originalTimeoutMs;
    });

    it("creates a test query interval when _timeout_ms is set", async () => {
      await runWithTestQueryEnabled(() => {
        const originalTimeoutMs = database._timeout_ms;
        database._timeout_ms = 5000; // 5 seconds

        // Should create interval
        database._init_test_query();

        expect(database._test_query).toBeDefined();
        expect(typeof database._test_query).toBe("object"); // setInterval returns a Timeout object

        // Restore
        database._timeout_ms = originalTimeoutMs;
      });
    });

    it("uses _timeout_ms as the interval duration", async () => {
      await runWithTestQueryEnabled(async () => {
        const originalTimeoutMs = database._timeout_ms;
        const originalDoTestQuery = database._do_test_query;

        // Set short timeout for testing
        database._timeout_ms = 100; // 100ms
        let callCount = 0;

        // Mock _do_test_query to count calls
        database._do_test_query = function () {
          callCount++;
        };

        // Initialize interval
        database._init_test_query();

        // Wait for at least 2 intervals
        await new Promise((resolve) => setTimeout(resolve, 250));

        // Should have been called at least twice
        expect(callCount).toBeGreaterThanOrEqual(2);

        // Cleanup
        database._do_test_query = originalDoTestQuery;
        database._timeout_ms = originalTimeoutMs;
      });
    }, 10000);
  });

  describe("_close_test_query - Stop health check interval", () => {
    afterEach(() => {
      // Clean up any test query interval after each test
      if (database._test_query) {
        clearInterval(database._test_query);
        delete database._test_query;
      }
    });

    it("does nothing if no test query interval exists", () => {
      delete database._test_query;

      // Should not throw
      expect(() => database._close_test_query()).not.toThrow();

      expect(database._test_query).toBeUndefined();
    });

    it("clears the test query interval", async () => {
      await runWithTestQueryEnabled(() => {
        // Create a test interval
        const originalTimeoutMs = database._timeout_ms;
        database._timeout_ms = 5000;
        database._init_test_query();

        expect(database._test_query).toBeDefined();

        // Close the interval
        database._close_test_query();

        expect(database._test_query).toBeUndefined();

        // Restore
        database._timeout_ms = originalTimeoutMs;
      });
    });

    it("stops the periodic execution after closing", (done) => {
      const originalTimeoutMs = database._timeout_ms;
      const originalDoTestQuery = database._do_test_query;

      // Set short timeout for testing
      database._timeout_ms = 50; // 50ms
      let callCount = 0;

      // Mock _do_test_query to count calls
      database._do_test_query = function () {
        callCount++;
      };

      // Initialize interval
      database._init_test_query();

      // Wait for one interval, then close
      setTimeout(() => {
        const callsBeforeClose = callCount;
        database._close_test_query();

        // Wait to ensure no more calls happen
        setTimeout(() => {
          expect(callCount).toBe(callsBeforeClose); // No new calls

          // Cleanup
          database._do_test_query = originalDoTestQuery;
          database._timeout_ms = originalTimeoutMs;

          done();
        }, 150);
      }, 100);
    }, 10000);
  });

  describe("Integration - Health monitoring lifecycle", () => {
    afterEach(() => {
      // Clean up any test query interval after each test
      if (database._test_query) {
        clearInterval(database._test_query);
        delete database._test_query;
      }
    });

    it("can init, execute, and close test query", async () => {
      await runWithTestQueryEnabled(async () => {
        const originalTimeoutMs = database._timeout_ms;
        const originalDoTestQuery = database._do_test_query;

        // Set short timeout for testing
        database._timeout_ms = 100;
        let executionCount = 0;

        // Track executions
        database._do_test_query = function () {
          executionCount++;
          originalDoTestQuery.call(this);
        };

        // Init -> should start periodic execution
        database._init_test_query();
        expect(database._test_query).toBeDefined();

        // Wait for at least one execution
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(executionCount).toBeGreaterThanOrEqual(1);

        // Close -> should stop execution
        database._close_test_query();
        expect(database._test_query).toBeUndefined();

        const countAfterClose = executionCount;

        // Wait to verify no more executions
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(executionCount).toBe(countAfterClose);

        // Cleanup
        database._do_test_query = originalDoTestQuery;
        database._timeout_ms = originalTimeoutMs;
      });
    }, 10000);

    it("can be initialized multiple times safely", async () => {
      await runWithTestQueryEnabled(() => {
        const originalTimeoutMs = database._timeout_ms;
        database._timeout_ms = 5000;

        // First init
        database._init_test_query();
        const firstInterval = database._test_query;
        expect(firstInterval).toBeDefined();

        // Manually clear first interval to avoid leak
        clearInterval(firstInterval);

        // Second init (without closing first via _close_test_query)
        database._init_test_query();
        const secondInterval = database._test_query;
        expect(secondInterval).toBeDefined();

        // Note: CoffeeScript implementation doesn't prevent multiple intervals
        // This test documents current behavior (potential resource leak if not manually cleared)

        // Cleanup
        database._close_test_query();
        database._timeout_ms = originalTimeoutMs;
      });
    });
  });
});
