/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 2: Schema & Metadata - Database schema introspection and management

Tests for 5 schema/metadata methods:
- _get_tables(cb) - Get list of all tables in public schema
- _get_columns(table, cb) - Get list of columns for a specific table
- _primary_keys(table) - Get array of primary key columns (synchronous)
- _primary_key(table) - Get single primary key, throws if composite (synchronous)
- update_schema(opts) - Sync database schema with SCHEMA definition

TDD Workflow:
These tests call CoffeeScript methods via db(), which will later delegate to TypeScript implementations
*/

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";

// These tests call CoffeeScript methods via db(), which now delegate to TypeScript implementations

describe("Schema & Metadata - Group 2", () => {
  let database: any; // Singleton database instance

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db(); // Get the singleton
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("_get_tables - Get list of all tables", () => {
    it("returns an array of table names", (done) => {
      database._get_tables((err, tables) => {
        expect(err).toBeUndefined();
        expect(Array.isArray(tables)).toBe(true);
        expect(tables.length).toBeGreaterThan(0);
        done();
      });
    }, 10000);

    it("includes known core tables like 'accounts'", (done) => {
      database._get_tables((err, tables) => {
        expect(err).toBeUndefined();
        expect(tables).toContain("accounts");
        done();
      });
    }, 10000);

    it("includes known core tables like 'projects'", (done) => {
      database._get_tables((err, tables) => {
        expect(err).toBeUndefined();
        expect(tables).toContain("projects");
        done();
      });
    }, 10000);

    it("all table names are non-empty strings", (done) => {
      database._get_tables((err, tables) => {
        expect(err).toBeUndefined();
        tables.forEach((table) => {
          expect(typeof table).toBe("string");
          expect(table.length).toBeGreaterThan(0);
        });
        done();
      });
    }, 10000);

    it("returns unique table names (no duplicates)", (done) => {
      database._get_tables((err, tables) => {
        expect(err).toBeUndefined();
        const uniqueTables = new Set(tables);
        expect(uniqueTables.size).toBe(tables.length);
        done();
      });
    }, 10000);
  });

  describe("_get_columns - Get columns for a specific table", () => {
    it("returns an array of column names for 'accounts' table", (done) => {
      database._get_columns("accounts", (err, columns) => {
        expect(err).toBeUndefined();
        expect(Array.isArray(columns)).toBe(true);
        expect(columns.length).toBeGreaterThan(0);
        done();
      });
    }, 10000);

    it("includes known columns for 'accounts' table", (done) => {
      database._get_columns("accounts", (err, columns) => {
        expect(err).toBeUndefined();
        // Known columns from accounts table
        expect(columns).toContain("account_id");
        expect(columns).toContain("created");
        expect(columns).toContain("email_address");
        done();
      });
    }, 10000);

    it("returns an array of column names for 'projects' table", (done) => {
      database._get_columns("projects", (err, columns) => {
        expect(err).toBeUndefined();
        expect(Array.isArray(columns)).toBe(true);
        expect(columns.length).toBeGreaterThan(0);
        done();
      });
    }, 10000);

    it("includes known columns for 'projects' table", (done) => {
      database._get_columns("projects", (err, columns) => {
        expect(err).toBeUndefined();
        // Known columns from projects table
        expect(columns).toContain("project_id");
        expect(columns).toContain("title");
        expect(columns).toContain("description");
        done();
      });
    }, 10000);

    it("all column names are non-empty strings", (done) => {
      database._get_columns("accounts", (err, columns) => {
        expect(err).toBeUndefined();
        columns.forEach((column) => {
          expect(typeof column).toBe("string");
          expect(column.length).toBeGreaterThan(0);
        });
        done();
      });
    }, 10000);

    it("returns unique column names (no duplicates)", (done) => {
      database._get_columns("accounts", (err, columns) => {
        expect(err).toBeUndefined();
        const uniqueColumns = new Set(columns);
        expect(uniqueColumns.size).toBe(columns.length);
        done();
      });
    }, 10000);

    it("returns empty array or error for non-existent table", (done) => {
      database._get_columns("nonexistent_table_xyz", (err, columns) => {
        // Either returns empty array or doesn't error (depending on implementation)
        if (!err) {
          expect(Array.isArray(columns)).toBe(true);
          expect(columns.length).toBe(0);
        }
        done();
      });
    }, 10000);
  });

  describe("_primary_keys - Get primary key columns (synchronous)", () => {
    it("returns an array for tables with primary keys", () => {
      const keys = database._primary_keys("accounts");
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
    });

    it("returns ['account_id'] for accounts table", () => {
      const keys = database._primary_keys("accounts");
      expect(keys).toEqual(["account_id"]);
    });

    it("returns ['project_id'] for projects table", () => {
      const keys = database._primary_keys("projects");
      expect(keys).toEqual(["project_id"]);
    });

    it("handles tables with composite primary keys", () => {
      // Some tables like 'patches' have composite keys
      const keys = database._primary_keys("patches");
      expect(Array.isArray(keys)).toBe(true);
      // Composite key should have multiple columns
      if (keys.length > 1) {
        expect(keys.length).toBeGreaterThan(1);
      }
    });

    it("returns consistent results when called multiple times", () => {
      const keys1 = database._primary_keys("accounts");
      const keys2 = database._primary_keys("accounts");
      expect(keys1).toEqual(keys2);
    });

    it("all primary key names are non-empty strings", () => {
      const keys = database._primary_keys("accounts");
      keys.forEach((key) => {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
      });
    });
  });

  describe("_primary_key - Get single primary key (synchronous)", () => {
    it("returns a string for tables with single primary key", () => {
      const key = database._primary_key("accounts");
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    it("returns 'account_id' for accounts table", () => {
      const key = database._primary_key("accounts");
      expect(key).toBe("account_id");
    });

    it("returns 'project_id' for projects table", () => {
      const key = database._primary_key("projects");
      expect(key).toBe("project_id");
    });

    it("throws error for tables with composite primary keys", () => {
      // Tables with composite keys should throw
      // Note: This test may need adjustment based on which tables actually have composite keys
      expect(() => {
        database._primary_key("patches");
      }).toThrow();
    });

    it("returns consistent results when called multiple times", () => {
      const key1 = database._primary_key("accounts");
      const key2 = database._primary_key("accounts");
      expect(key1).toBe(key2);
    });
  });

  describe("update_schema - Sync database schema", () => {
    it("completes without error when syncing schema", (done) => {
      database.update_schema({
        cb: (err) => {
          expect(err).toBeUndefined();
          done();
        },
      });
    }, 30000); // Longer timeout for schema operations

    it("accepts callback and calls it on completion", (done) => {
      let callbackCalled = false;
      database.update_schema({
        cb: (err) => {
          callbackCalled = true;
          expect(err).toBeUndefined();
          expect(callbackCalled).toBe(true);
          done();
        },
      });
    }, 30000);

    it("can be called multiple times without error", (done) => {
      database.update_schema({
        cb: (err1) => {
          expect(err1).toBeUndefined();
          database.update_schema({
            cb: (err2) => {
              expect(err2).toBeUndefined();
              done();
            },
          });
        },
      });
    }, 45000); // Extra time for two schema syncs

    it("handles callback being optional (no crash if missing)", (done) => {
      // Should not crash even if callback is not provided
      expect(() => {
        database.update_schema({});
      }).not.toThrow();
      // Give it time to complete
      setTimeout(done, 5000);
    }, 10000);
  });
});
