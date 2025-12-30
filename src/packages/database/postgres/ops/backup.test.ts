/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { execute_code } from "@cocalc/backend/misc_node";
import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { SCHEMA } from "@cocalc/util/schema";

import { NON_CRITICAL_TABLES } from "./utils";
import type { PostgreSQL } from "../types";

jest.mock("@cocalc/backend/misc_node", () => ({
  execute_code: jest.fn(),
}));

const executeCode = execute_code as jest.MockedFunction<typeof execute_code>;

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await testCleanup();
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

describe("_backup_table", () => {
  let database: any;

  beforeAll(() => {
    database = db() as any;
    database._database = "testdb";
    database._host = "localhost";
    database._password = "secret";
  });

  beforeEach(() => {
    executeCode.mockReset();
    executeCode.mockImplementation((opts) => {
      opts.cb?.(undefined);
    });
  });

  it("uses default path when not provided", async () => {
    await new Promise<void>((resolve, reject) => {
      database._backup_table({
        table: "accounts",
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    expect(executeCode).toHaveBeenCalledTimes(1);
    const call = executeCode.mock.calls[0][0];
    expect(call.command).toBe(
      "mkdir -p backup; time pg_dump -Fc --table accounts testdb > backup/accounts.bak",
    );
  });

  it("passes command options and env to execute_code", async () => {
    await new Promise<void>((resolve, reject) => {
      database._backup_table({
        table: "projects",
        path: "/var/backups",
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    const call = executeCode.mock.calls[0][0];
    expect(call.command).toBe(
      "mkdir -p /var/backups; time pg_dump -Fc --table projects testdb > /var/backups/projects.bak",
    );
    expect(call.timeout).toBe(0);
    expect(call.home).toBe(".");
    expect(call.err_on_exit).toBe(true);
    expect(call.env).toEqual({
      PGPASSWORD: "secret",
      PGUSER: "smc",
      PGHOST: "localhost",
    });
  });

  it("forwards errors from execute_code", async () => {
    const err = new Error("boom");
    executeCode.mockImplementationOnce((opts) => {
      opts.cb?.(err);
    });

    await new Promise<void>((resolve) => {
      database._backup_table({
        table: "accounts",
        cb: (error) => {
          expect(error).toBe(err);
          resolve();
        },
      });
    });
  });
});

describe("_backup_bup", () => {
  let database: PostgreSQL;

  beforeAll(() => {
    database = db();
  });

  beforeEach(() => {
    executeCode.mockReset();
    executeCode.mockImplementation((opts) => {
      opts.cb?.(undefined);
    });
  });

  it("uses default path when not provided", async () => {
    await new Promise<void>((resolve, reject) => {
      database._backup_bup({
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    expect(executeCode).toHaveBeenCalledTimes(1);
    const call = executeCode.mock.calls[0][0];
    expect(call.command).toBe(
      "mkdir -p 'backup' && export  && bup init && bup index 'backup' && bup save --strip --compress=0 'backup' -n master",
    );
    expect(call.timeout).toBe(0);
    expect(call.home).toBe(".");
    expect(call.err_on_exit).toBe(true);
    expect(call.env).toEqual({
      BUP_DIR: "backup/.bup",
    });
  });

  it("uses provided path for bup archive", async () => {
    await new Promise<void>((resolve, reject) => {
      database._backup_bup({
        path: "/var/backups",
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    const call = executeCode.mock.calls[0][0];
    expect(call.command).toBe(
      "mkdir -p '/var/backups' && export  && bup init && bup index '/var/backups' && bup save --strip --compress=0 '/var/backups' -n master",
    );
    expect(call.env).toEqual({
      BUP_DIR: "/var/backups/.bup",
    });
  });

  it("forwards errors from execute_code", async () => {
    const err = new Error("boom");
    executeCode.mockImplementationOnce((opts) => {
      opts.cb?.(err);
    });

    await new Promise<void>((resolve) => {
      database._backup_bup({
        cb: (error) => {
          expect(error).toBe(err);
          resolve();
        },
      });
    });
  });
});

describe("backup_tables", () => {
  let database: any;

  beforeAll(() => {
    database = db() as any;
    database._database = "testdb";
    database._host = "localhost";
    database._password = "secret";
  });

  beforeEach(() => {
    executeCode.mockReset();
    executeCode.mockImplementation((opts) => {
      opts.cb?.(undefined);
    });
  });

  it("backs up tables then runs bup", async () => {
    await new Promise<void>((resolve, reject) => {
      database.backup_tables({
        tables: ["accounts", "projects"],
        path: "/var/backups",
        limit: 1,
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    expect(executeCode).toHaveBeenCalledTimes(3);
    const commands = executeCode.mock.calls.map((call) => call[0].command);
    expect(commands).toEqual([
      "mkdir -p /var/backups; time pg_dump -Fc --table accounts testdb > /var/backups/accounts.bak",
      "mkdir -p /var/backups; time pg_dump -Fc --table projects testdb > /var/backups/projects.bak",
      "mkdir -p '/var/backups' && export  && bup init && bup index '/var/backups' && bup save --strip --compress=0 '/var/backups' -n master",
    ]);
  });
});
