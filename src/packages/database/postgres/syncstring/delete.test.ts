/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { sha1 } from "@cocalc/backend/misc_node";
import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";

import type { PostgreSQL } from "../types";

describe("delete_syncstring", () => {
  let database: PostgreSQL;
  let pool: any;

  async function delete_syncstring_wrapper(opts: {
    string_id: string;
  }): Promise<void> {
    return callback_opts(database.delete_syncstring.bind(database))(opts);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db();
    pool = getPool();
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  it("rejects invalid string_id", async () => {
    await expect(
      delete_syncstring_wrapper({ string_id: "short" }),
    ).rejects.toMatch(/invalid string_id/);
  });

  it("deletes syncstring and patches when not archived", async () => {
    const project_id = uuid();
    const path = `file-${uuid()}.txt`;
    const string_id = sha1(`${project_id}${path}`);
    const time = new Date();

    await pool.query(
      "INSERT INTO syncstrings(string_id, project_id, path) VALUES($1, $2, $3)",
      [string_id, project_id, path],
    );
    await pool.query(
      "INSERT INTO patches(string_id, time, patch, is_snapshot) VALUES($1, $2, $3, false)",
      [string_id, time, "patch-1"],
    );
    await pool.query(
      "INSERT INTO patches(string_id, time, patch, is_snapshot) VALUES($1, $2, $3, false)",
      [string_id, new Date(time.getTime() + 1), "patch-2"],
    );

    await delete_syncstring_wrapper({ string_id });

    const syncResult = await pool.query(
      "SELECT COUNT(*) AS count FROM syncstrings WHERE string_id = $1",
      [string_id],
    );
    expect(parseInt(syncResult.rows[0].count, 10)).toBe(0);

    const patchResult = await pool.query(
      "SELECT COUNT(*) AS count FROM patches WHERE string_id = $1",
      [string_id],
    );
    expect(parseInt(patchResult.rows[0].count, 10)).toBe(0);
  });

  it("deletes archived blob when syncstring is archived", async () => {
    const project_id = uuid();
    const path = `archived-${uuid()}.txt`;
    const string_id = sha1(`${project_id}${path}`);
    const blob_id = uuid();
    const blob = Buffer.from("archive");

    await pool.query(
      "INSERT INTO blobs(id, blob, size, created) VALUES ($1, $2, $3, $4)",
      [blob_id, blob, blob.length, new Date()],
    );
    await pool.query(
      "INSERT INTO syncstrings(string_id, project_id, path, archived) VALUES($1, $2, $3, $4)",
      [string_id, project_id, path, blob_id],
    );

    await delete_syncstring_wrapper({ string_id });

    const syncResult = await pool.query(
      "SELECT COUNT(*) AS count FROM syncstrings WHERE string_id = $1",
      [string_id],
    );
    expect(parseInt(syncResult.rows[0].count, 10)).toBe(0);

    const blobResult = await pool.query(
      "SELECT COUNT(*) AS count FROM blobs WHERE id = $1",
      [blob_id],
    );
    expect(parseInt(blobResult.rows[0].count, 10)).toBe(0);
  });
});
