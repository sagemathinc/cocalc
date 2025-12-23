/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as fs from "fs";

import { execute_code } from "@cocalc/backend/misc_node";
import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import type { PostgreSQL } from "../types";

jest.mock("@cocalc/backend/misc_node", () => ({
  execute_code: jest.fn(),
}));

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readdirSync: jest.fn(),
}));

const executeCode = execute_code as jest.MockedFunction<typeof execute_code>;
const readdirSync = fs.readdirSync as unknown as jest.MockedFunction<
  (path: fs.PathLike) => string[]
>;

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("_restore_table", () => {
  let database: any;
  let originalQuery: PostgreSQL["_query"];

  beforeAll(() => {
    database = db() as any;
    originalQuery = database._query;
    database._database = "testdb";
    database._host = "localhost";
    database._password = "secret";
    database._user = "smc";
  });

  afterAll(() => {
    database._query = originalQuery;
  });

  beforeEach(() => {
    executeCode.mockReset();
    executeCode.mockImplementation((opts) => {
      opts.cb?.(undefined);
    });
    database._query = jest.fn((opts) => {
      opts.cb?.(undefined);
    });
  });

  it("drops table before running pg_restore", async () => {
    await new Promise<void>((resolve, reject) => {
      database._restore_table({
        table: "accounts",
        path: "/var/backups",
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    expect(database._query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "DROP TABLE IF EXISTS accounts",
      }),
    );
    expect(executeCode).toHaveBeenCalledTimes(1);
    const call = executeCode.mock.calls[0][0];
    expect(call.command).toBe(
      "time pg_restore -C -d testdb /var/backups/accounts.bak",
    );
    expect(call.env).toEqual({
      PGPASSWORD: "secret",
      PGUSER: "smc",
      PGHOST: "localhost",
    });
  });

  it("forwards errors from query", async () => {
    const err = new Error("query failed");
    database._query = jest.fn((opts) => {
      opts.cb?.(err);
    });

    await new Promise<void>((resolve) => {
      database._restore_table({
        table: "accounts",
        cb: (error) => {
          expect(error).toBe(err);
          resolve();
        },
      });
    });

    expect(executeCode).not.toHaveBeenCalled();
  });

  it("forwards errors from execute_code", async () => {
    const err = new Error("boom");
    executeCode.mockImplementationOnce((opts) => {
      opts.cb?.(err);
    });

    await new Promise<void>((resolve) => {
      database._restore_table({
        table: "accounts",
        cb: (error) => {
          expect(error).toBe(err);
          resolve();
        },
      });
    });
  });
});

describe("restore_tables", () => {
  let database: any;
  let originalQuery: PostgreSQL["_query"];

  beforeAll(() => {
    database = db() as any;
    originalQuery = database._query;
    database._database = "testdb";
    database._host = "localhost";
    database._password = "secret";
    database._user = "smc";
  });

  afterAll(() => {
    database._query = originalQuery;
  });

  beforeEach(() => {
    executeCode.mockReset();
    executeCode.mockImplementation((opts) => {
      opts.cb?.(undefined);
    });
    database._query = jest.fn((opts) => {
      opts.cb?.(undefined);
    });
    readdirSync.mockReset();
  });

  it("restores all backed up tables when none specified", async () => {
    readdirSync.mockReturnValue([
      "accounts.bak",
      "projects.bak",
      "notes.txt",
    ] as unknown as string[]);

    await new Promise<void>((resolve, reject) => {
      database.restore_tables({
        path: "/var/backups",
        limit: 1,
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    const commands = executeCode.mock.calls.map((call) => call[0].command);
    expect(commands).toEqual([
      "time pg_restore -C -d testdb /var/backups/accounts.bak",
      "time pg_restore -C -d testdb /var/backups/projects.bak",
    ]);
  });

  it("fails when a requested table is missing", async () => {
    readdirSync.mockReturnValue(["accounts.bak"] as unknown as string[]);

    await new Promise<void>((resolve) => {
      database.restore_tables({
        tables: ["missing"],
        path: "/var/backups",
        cb: (err) => {
          expect(err).toBe("there is no backup of 'missing'");
          resolve();
        },
      });
    });

    expect(executeCode).not.toHaveBeenCalled();
  });
});
