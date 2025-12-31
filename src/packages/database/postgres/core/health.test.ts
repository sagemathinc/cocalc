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

  describe("_do_test_query - Execute health check", () => {
    it("executes a simple SELECT NOW() query", (done) => {
      // Store original _query to spy on it
      const originalQuery = database._query;
      let queryCalled = false;
      let queryOptions: any = null;

      // Temporarily replace _query to capture the call
      database._query = function (opts: any) {
        queryCalled = true;
        queryOptions = opts;
        // Call the original _query
        return originalQuery.call(this, opts);
      };

      // Execute the test query
      database._do_test_query();

      // Wait a bit for the query to complete
      setTimeout(() => {
        // Restore original _query
        database._query = originalQuery;

        // Verify the query was called
        expect(queryCalled).toBe(true);
        expect(queryOptions).toBeDefined();
        expect(queryOptions.query).toBe("SELECT NOW()");
        expect(queryOptions.cb).toBeDefined();

        done();
      }, 100);
    }, 10000);

    it("completes without error", (done) => {
      // Store original _query to capture callback
      const originalQuery = database._query;
      let callbackError: any = undefined;
      let callbackResult: any = undefined;

      // Replace _query to capture callback invocation
      database._query = function (opts: any) {
        const originalCb = opts.cb;
        opts.cb = (err: any, result: any) => {
          callbackError = err;
          callbackResult = result;
          if (originalCb) {
            originalCb(err, result);
          }
        };
        return originalQuery.call(this, opts);
      };

      // Execute the test query
      database._do_test_query();

      // Wait for query to complete
      setTimeout(() => {
        // Restore original _query
        database._query = originalQuery;

        // Verify no error occurred
        expect(callbackError == null || callbackError === undefined).toBe(true);
        expect(callbackResult).toBeDefined();

        done();
      }, 100);
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

    it("creates a test query interval when _timeout_ms is set", () => {
      const originalTimeoutMs = database._timeout_ms;
      database._timeout_ms = 5000; // 5 seconds

      // Should create interval
      database._init_test_query();

      expect(database._test_query).toBeDefined();
      expect(typeof database._test_query).toBe("object"); // setInterval returns a Timeout object

      // Restore
      database._timeout_ms = originalTimeoutMs;
    });

    it("uses _timeout_ms as the interval duration", (done) => {
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
      setTimeout(() => {
        // Should have been called at least twice
        expect(callCount).toBeGreaterThanOrEqual(2);

        // Cleanup
        database._do_test_query = originalDoTestQuery;
        database._timeout_ms = originalTimeoutMs;

        done();
      }, 250);
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

    it("clears the test query interval", () => {
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

    it("can init, execute, and close test query", (done) => {
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
      setTimeout(() => {
        expect(executionCount).toBeGreaterThanOrEqual(1);

        // Close -> should stop execution
        database._close_test_query();
        expect(database._test_query).toBeUndefined();

        const countAfterClose = executionCount;

        // Wait to verify no more executions
        setTimeout(() => {
          expect(executionCount).toBe(countAfterClose);

          // Cleanup
          database._do_test_query = originalDoTestQuery;
          database._timeout_ms = originalTimeoutMs;

          done();
        }, 150);
      }, 200);
    }, 10000);

    it("can be initialized multiple times safely", () => {
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
