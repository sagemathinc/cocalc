/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { db } from "@cocalc/database";
import { SCHEMA } from "@cocalc/util/schema";

import { NON_CRITICAL_TABLES } from "./ops";
import type { PostgreSQL } from "./types";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("_get_backup_tables", () => {
  let database: PostgreSQL;

  beforeAll(() => {
    database = db();
  });

  it("returns array as-is when passed an array", () => {
    const input = ["table1", "table2", "table3"];
    const result = database._get_backup_tables(input);
    expect(result).toEqual(input);
    expect(result).toBe(input); // Should return the exact same array
  });

  it("returns all non-virtual tables when passed 'all'", () => {
    const result = database._get_backup_tables("all");
    const expected = Object.keys(SCHEMA).filter((t) => !SCHEMA[t].virtual);

    expect(result).toEqual(expected);
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns critical tables when passed 'critical'", () => {
    const result = database._get_backup_tables("critical");

    // All non-virtual tables
    const allTables = Object.keys(SCHEMA).filter((t) => !SCHEMA[t].virtual);

    // Critical tables should exclude:
    // - Tables with 'log' in the name
    // - Tables in the NON_CRITICAL_TABLES list
    for (const table of result) {
      expect(table).not.toContain("log");
      expect(NON_CRITICAL_TABLES).not.toContain(table);
      expect(allTables).toContain(table); // Must be a real table
    }

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(allTables.length); // Should be subset
  });

  it("wraps single table name in array", () => {
    const result = database._get_backup_tables("accounts");
    expect(result).toEqual(["accounts"]);
  });

  it("wraps arbitrary string in array", () => {
    const result = database._get_backup_tables("some_random_table");
    expect(result).toEqual(["some_random_table"]);
  });

  it("handles empty array", () => {
    const input: string[] = [];
    const result = database._get_backup_tables(input);
    expect(result).toEqual([]);
  });

  it("critical tables do not include 'stats'", () => {
    const result = database._get_backup_tables("critical");
    expect(result).not.toContain("stats");
  });

  it("critical tables do not include 'syncstrings'", () => {
    const result = database._get_backup_tables("critical");
    expect(result).not.toContain("syncstrings");
  });

  it("critical tables do not include tables with 'log' in name", () => {
    const result = database._get_backup_tables("critical");
    const allTables = Object.keys(SCHEMA).filter((t) => !SCHEMA[t].virtual);
    const logTables = allTables.filter((t) => t.includes("log"));

    // If there are any log tables in the schema, ensure they're excluded
    if (logTables.length > 0) {
      for (const logTable of logTables) {
        expect(result).not.toContain(logTable);
      }
    }
  });

  it("critical tables are a subset of all tables", () => {
    const critical = database._get_backup_tables("critical");
    const all = database._get_backup_tables("all");

    for (const table of critical) {
      expect(all).toContain(table);
    }
  });
});
