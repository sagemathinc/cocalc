/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";

import centralLog from "./central-log";
import {
  get_client_error_log,
  get_log,
  get_user_log,
  log_client_error,
  uncaught_exception,
  webapp_error,
} from "./log-query";
import type { PostgreSQL } from "./types";

describe("log query methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("get_log", () => {
    it("retrieves logs by event type", async () => {
      const testEvent = "test_get_log_" + Date.now();
      const testValue = { test: "data", timestamp: Date.now() };

      // Insert a test log entry
      await centralLog({ event: testEvent, value: testValue });

      // Retrieve the log entry
      const results = await get_log(database, { event: testEvent });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const foundEntry = results.find((r) => r.event === testEvent);
      expect(foundEntry).toBeDefined();
      expect(foundEntry!.value).toMatchObject(testValue);
    });

    it("retrieves logs with time range", async () => {
      const testEvent = "test_time_range_" + Date.now();
      const start = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const end = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

      await centralLog({ event: testEvent, value: { time_test: true } });

      const results = await get_log(database, {
        event: testEvent,
        start,
        end,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const foundEntry = results.find((r) => r.event === testEvent);
      expect(foundEntry).toBeDefined();
    });

    it("retrieves logs with JSONB containment filter", async () => {
      const testEvent = "test_jsonb_filter_" + Date.now();
      const testAccountId = uuid();

      await centralLog({
        event: testEvent,
        value: { account_id: testAccountId, action: "test" },
      });

      const results = await get_log(database, {
        event: testEvent,
        where: { account_id: testAccountId },
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const foundEntry = results.find((r) => r.event === testEvent);
      expect(foundEntry).toBeDefined();
      expect(foundEntry!.value.account_id).toBe(testAccountId);
    });
  });

  describe("get_user_log", () => {
    it("retrieves user-specific logs", async () => {
      const testEvent = "test_user_log_" + Date.now();
      const testAccountId = uuid();

      await centralLog({
        event: testEvent,
        value: { account_id: testAccountId, action: "user_action" },
      });

      const results = await get_user_log(database, {
        event: testEvent,
        account_id: testAccountId,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const foundEntry = results.find((r) => r.event === testEvent);
      expect(foundEntry).toBeDefined();
      expect(foundEntry!.value.account_id).toBe(testAccountId);
    });

    it("uses default event 'successful_sign_in'", async () => {
      const testAccountId = uuid();

      await centralLog({
        event: "successful_sign_in",
        value: { account_id: testAccountId, ip: "127.0.0.1" },
      });

      const results = await get_user_log(database, {
        account_id: testAccountId,
      });

      // Should only return successful_sign_in events for this account
      results.forEach((entry) => {
        expect(entry.event).toBe("successful_sign_in");
        expect(entry.value.account_id).toBe(testAccountId);
      });
    });

    it("filters by time range", async () => {
      const testEvent = "test_user_log_time_" + Date.now();
      const testAccountId = uuid();
      const start = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const end = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

      await centralLog({
        event: testEvent,
        value: { account_id: testAccountId, time_test: true },
      });

      const results = await get_user_log(database, {
        event: testEvent,
        account_id: testAccountId,
        start,
        end,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("uncaught_exception", () => {
    it("logs an uncaught exception", async () => {
      const testError = new Error("Test exception for logging");
      testError.stack = "Test stack trace\n  at test location";

      await uncaught_exception(database, testError);

      // Verify the exception was logged
      const results = await get_log(database, {
        event: "uncaught_exception",
      });

      expect(results.length).toBeGreaterThan(0);

      // Find our specific exception (check for our test message in recent logs)
      const recentEntries = results.slice(-5); // Check last 5 entries
      const foundEntry = recentEntries.find((r) =>
        r.value.error?.includes("Test exception for logging"),
      );

      expect(foundEntry).toBeDefined();
      expect(foundEntry!.value.error).toContain("Test exception for logging");
      expect(foundEntry!.value.stack).toContain("Test stack trace");
      expect(foundEntry!.value.host).toBeDefined();
    });

    it("handles exceptions without throwing", async () => {
      const testError = new Error("Another test exception");

      // Should not throw even if there are issues
      await expect(
        uncaught_exception(database, testError),
      ).resolves.not.toThrow();
    });
  });

  describe("log_client_error", () => {
    it("logs a client error with defaults", async () => {
      await log_client_error(database, {});

      // Verify the error was logged
      const results = await get_client_error_log(database, {});
      expect(results.length).toBeGreaterThan(0);

      // Check the most recent entry has default values
      const lastEntry = results[results.length - 1];
      expect(lastEntry.event).toBe("event");
      expect(lastEntry.error).toBe("error");
    });

    it("logs a client error with custom values", async () => {
      const testEvent = "test_client_error_" + Date.now();
      const testError = "Test error message";
      const testAccountId = uuid();

      await log_client_error(database, {
        event: testEvent,
        error: testError,
        account_id: testAccountId,
      });

      // Retrieve and verify
      const results = await get_client_error_log(database, {
        event: testEvent,
      });

      expect(results.length).toBeGreaterThan(0);
      const foundEntry = results.find((r) => r.event === testEvent);
      expect(foundEntry).toBeDefined();
      expect(foundEntry!.error).toBe(testError);
      expect(foundEntry!.account_id).toBe(testAccountId);
    });
  });

  describe("webapp_error", () => {
    it("logs a webapp error with minimal data", async () => {
      const testName = "TestError_" + Date.now();

      await webapp_error(database, {
        name: testName,
        message: "Test error message",
      });

      // Can't easily query webapp_errors table without adding another query function,
      // but we can verify it doesn't throw
      await expect(
        webapp_error(database, { name: testName }),
      ).resolves.not.toThrow();
    });

    it("logs a webapp error with full details", async () => {
      const testName = "FullError_" + Date.now();
      const testAccountId = uuid();

      await webapp_error(database, {
        account_id: testAccountId,
        name: testName,
        message: "Full test error",
        comment: "Test comment",
        stacktrace: "Error: test\n  at test.js:10:5",
        file: "test.js",
        path: "/app/test.js",
        lineNumber: 10,
        columnNumber: 5,
        severity: "error",
        browser: "Chrome",
        mobile: false,
        responsive: true,
        user_agent: "Mozilla/5.0...",
        smc_version: "1.0.0",
        build_date: "2024-12-01",
        smc_git_rev: "abc123",
        uptime: "1000",
        start_time: new Date(),
      });

      // Verify it completes successfully
      expect(true).toBe(true);
    });
  });

  describe("get_client_error_log", () => {
    it("retrieves client error log entries", async () => {
      const testEvent = "get_client_errors_" + Date.now();

      // Log some errors
      await log_client_error(database, { event: testEvent });
      await log_client_error(database, { event: testEvent });

      // Retrieve them
      const results = await get_client_error_log(database, {
        event: testEvent,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach((entry) => {
        expect(entry.event).toBe(testEvent);
      });
    });

    it("filters by time range", async () => {
      const testEvent = "time_filter_errors_" + Date.now();
      const start = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const end = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

      await log_client_error(database, { event: testEvent });

      const results = await get_client_error_log(database, {
        event: testEvent,
        start,
        end,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
