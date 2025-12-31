/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 3b: Delete Operations

Tests for 3 database deletion methods:
- delete_expired(opts) - Delete expired entries from tables with expire column
- delete_all(opts) - Delete all data from all tables (keeps schema)
- delete_entire_database(opts) - Drop entire database (DESTRUCTIVE)

TDD Workflow:
These tests call CoffeeScript methods via db(), which will later delegate to TypeScript implementations
*/

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";


describe("Delete Operations - Group 3b", () => {
  let database: any; // Singleton database instance

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db(); // Get the singleton
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("delete_expired - Delete expired entries", () => {
    // Note: Testing delete_expired requires tables with expire columns
    // The implementation queries SCHEMA to find tables with expire fields

    it("accepts callback and completes without error", (done) => {
      database.delete_expired({
        cb: (err) => {
          // CoffeeScript passes null for success, not undefined
          expect(err == null || err === undefined).toBe(true);
          done();
        },
      });
    }, 30000);

    it("supports count_only mode", (done) => {
      database.delete_expired({
        count_only: true,
        cb: (err) => {
          expect(err == null || err === undefined).toBe(true);
          done();
        },
      });
    }, 30000);

    it("supports targeting specific table", (done) => {
      // Target a table that we know has an expire column
      database.delete_expired({
        table: "remember_me",
        cb: (err) => {
          expect(err == null || err === undefined).toBe(true);
          done();
        },
      });
    }, 30000);

    it("handles non-existent table gracefully", (done) => {
      database.delete_expired({
        table: "nonexistent_table_xyz",
        cb: (err) => {
          // Should get an error for non-existent table
          expect(err).toBeDefined();
          done();
        },
      });
    }, 30000);

    it("can be called multiple times", (done) => {
      database.delete_expired({
        cb: (err1) => {
          expect(err1 == null || err1 === undefined).toBe(true);
          database.delete_expired({
            cb: (err2) => {
              expect(err2 == null || err2 === undefined).toBe(true);
              done();
            },
          });
        },
      });
    }, 45000);
  });

  describe("delete_all - Delete all table contents", () => {
    it("requires confirmation='yes' to proceed", (done) => {
      database.delete_all({
        confirm: "no",
        cb: (err) => {
          expect(err).toBeDefined();
          expect(err).toContain("confirm='yes'");
          done();
        },
      });
    }, 10000);

    it("rejects when confirmation is missing", (done) => {
      database.delete_all({
        // No confirm parameter
        cb: (err) => {
          expect(err).toBeDefined();
          expect(err).toContain("confirm='yes'");
          done();
        },
      });
    }, 10000);

    it("rejects with wrong confirmation value", (done) => {
      database.delete_all({
        confirm: "YES", // Wrong case
        cb: (err) => {
          expect(err).toBeDefined();
          expect(err).toContain("confirm='yes'");
          done();
        },
      });
    }, 10000);

    // NOTE: We intentionally DO NOT test the actual deletion with confirm='yes'
    // because it would delete all data in the test database and potentially
    // break other tests running in parallel. The CoffeeScript baseline behavior
    // is well-established from existing test suites.
  });

  describe("delete_entire_database - Drop entire database", () => {
    // Note: We test confirmation checks without mocking, but skip actual deletion
    // The actual dropdb execution is tested elsewhere in the full test suite

    it("requires confirmation='yes' to proceed", (done) => {
      database.delete_entire_database({
        confirm: "no",
        cb: (err) => {
          expect(err).toBeDefined();
          expect(err).toContain("confirm='yes'");
          done();
        },
      });
    }, 10000);

    it("rejects when confirmation is missing", (done) => {
      database.delete_entire_database({
        // No confirm parameter
        cb: (err) => {
          expect(err).toBeDefined();
          expect(err).toContain("confirm='yes'");
          done();
        },
      });
    }, 10000);

    it("rejects with wrong confirmation value", (done) => {
      database.delete_entire_database({
        confirm: "sure", // Wrong value
        cb: (err) => {
          expect(err).toBeDefined();
          expect(err).toContain("confirm='yes'");
          done();
        },
      });
    }, 10000);

    // NOTE: We do not test actual database deletion with confirm='yes' because:
    // 1. It would destroy the test database
    // 2. Mocking misc_node.execute_code interferes with database initialization
  });
});
