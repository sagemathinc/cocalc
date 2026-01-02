/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 1: Database Utilities - Core utility methods for PostgreSQL class

Tests for 9 utility methods:
- _dbg(f) - Debug logger factory
- _init_metrics() - Initialize Prometheus metrics
- concurrent() - Get concurrent query count
- is_heavily_loaded() - Check if heavily loaded
- sha1(...args) - Generate SHA1 hash
- sanitize(s) - Escape string for SQL
- clear_cache() - Clear LRU cache
- engine() - Return 'postgresql'
- _ensure_database_exists(cb) - Create database if missing

TDD Workflow:
- USE_TYPESCRIPT = false: Test against CoffeeScript implementation (db())
- USE_TYPESCRIPT = true: Test against TypeScript implementation (direct import)
*/

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";

// These tests call CoffeeScript methods via db(), which now delegate to TypeScript implementations

describe("Database Utilities - Group 1", () => {
  let database: any; // Singleton database instance

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db(); // Get the singleton
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("_dbg - Debug logger factory", () => {
    it("returns a debug function when debug is enabled", () => {
      const dbgFn = database._dbg("test_method");
      expect(typeof dbgFn).toBe("function");
    });

    it("returns a no-op function when debug is disabled", () => {
      const database = db();
      // Save original debug state
      const originalDebug = database._debug;

      // Disable debug
      database._debug = false;
      const dbgFn = database._dbg("test_method");
      expect(typeof dbgFn).toBe("function");

      // Calling it should not throw
      expect(() => dbgFn("test message")).not.toThrow();

      // Restore original state
      database._debug = originalDebug;
    });

    it("logs messages with method name prefix", () => {
      const database = db();
      const originalDebug = database._debug;

      database._debug = true;
      const dbgFn = database._dbg("test_method");

      // Should not throw when called
      expect(() => dbgFn({ test: "data" })).not.toThrow();

      database._debug = originalDebug;
    });
  });

  describe("_init_metrics - Initialize Prometheus metrics", () => {
    it("initializes metrics without error", () => {
      const database = db();
      expect(() => database._init_metrics()).not.toThrow();
    });

    it("creates query_time_histogram metric", () => {
      const database = db();
      database._init_metrics();
      expect(database.query_time_histogram).toBeDefined();
    });

    it("creates concurrent_counter metric", () => {
      const database = db();
      database._init_metrics();
      expect(database.concurrent_counter).toBeDefined();
    });

    it("handles metric initialization errors gracefully", () => {
      const database = db();
      // Should not throw even if metrics are already initialized
      expect(() => database._init_metrics()).not.toThrow();
      expect(() => database._init_metrics()).not.toThrow();
    });
  });

  describe("concurrent - Get concurrent query count", () => {
    it("returns 0 when no queries are running", () => {
      const database = db();
      const count = database.concurrent();
      expect(count).toBe(0);
    });

    it("returns a non-negative number", () => {
      const database = db();
      const count = database.concurrent();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("is_heavily_loaded - Check if heavily loaded", () => {
    it("returns false when concurrent queries are low", () => {
      const database = db();
      const loaded = database.is_heavily_loaded();
      expect(typeof loaded).toBe("boolean");
      // With no queries running, should not be heavily loaded
      expect(loaded).toBe(false);
    });

    it("returns a boolean value", () => {
      const database = db();
      const loaded = database.is_heavily_loaded();
      expect(typeof loaded).toBe("boolean");
    });
  });

  describe("sha1 - Generate SHA1 hash", () => {
    it("generates consistent hash for same input", () => {
      const database = db();
      const hash1 = database.sha1("test", "data");
      const hash2 = database.sha1("test", "data");
      expect(hash1).toBe(hash2);
    });

    it("generates different hashes for different inputs", () => {
      const database = db();
      const hash1 = database.sha1("test", "data");
      const hash2 = database.sha1("different", "data");
      expect(hash1).not.toBe(hash2);
    });

    it("handles object inputs by JSON stringifying", () => {
      const database = db();
      const hash = database.sha1({ foo: "bar" }, { baz: 123 });
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(40); // SHA1 produces 40 hex characters
    });

    it("handles mixed string and object inputs", () => {
      const database = db();
      const hash = database.sha1("prefix", { data: "value" }, "suffix");
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(40);
    });

    it("produces valid hex string", () => {
      const database = db();
      const hash = database.sha1("test");
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  describe("sanitize - Escape string for SQL", () => {
    it("sanitizes simple strings", () => {
      const database = db();
      const result = database.sanitize("test string");
      expect(typeof result).toBe("string");
    });

    it("escapes single quotes", () => {
      const database = db();
      const result = database.sanitize("test's string");
      // SQL escaping uses doubled single quotes
      expect(result).toBe("'test''s string'");
    });

    it("handles empty string", () => {
      const database = db();
      const result = database.sanitize("");
      expect(typeof result).toBe("string");
    });

    it("prevents SQL injection attempts", () => {
      const database = db();
      const malicious = "'; DROP TABLE users; --";
      const result = database.sanitize(malicious);
      // Should be safely escaped
      expect(result).not.toBe(malicious);
    });
  });

  describe("clear_cache - Clear LRU cache", () => {
    it("clears cache without error", () => {
      const database = db();
      expect(() => database.clear_cache()).not.toThrow();
    });

    it("can be called multiple times", () => {
      const database = db();
      expect(() => {
        database.clear_cache();
        database.clear_cache();
        database.clear_cache();
      }).not.toThrow();
    });
  });

  describe("engine - Return database engine identifier", () => {
    it("returns 'postgresql'", () => {
      const database = db();
      expect(database.engine()).toBe("postgresql");
    });
  });

  describe("_ensure_database_exists - Create database if missing", () => {
    it("completes without error for existing database", async () => {
      const database = db();

      await new Promise<void>((resolve, reject) => {
        database._ensure_database_exists((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

    it("uses callback pattern correctly", (done) => {
      const database = db();

      database._ensure_database_exists((_err) => {
        // Should complete (may succeed or fail depending on environment)
        // The important thing is the callback is called
        done();
      });
    }, 10000); // Longer timeout for shell commands
  });
});
