/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";

import type { PostgreSQL } from "../types";

describe("project column queries", () => {
  const database: PostgreSQL = db();

  const getProjectLegacy = callback_opts(
    database.get_project.bind(database),
  ) as (opts: {
    project_id: string;
    columns?: string[];
  }) => Promise<Record<string, unknown> | undefined>;

  async function getProject(opts: {
    project_id: string;
    columns?: string[];
  }): Promise<Record<string, unknown> | undefined> {
    return getProjectLegacy(opts);
  }

  async function getProjectColumn(
    column: string,
    project_id: string,
  ): Promise<unknown> {
    return await new Promise((resolve, reject) => {
      database._get_project_column(column, project_id, (err, result) => {
        if (err != null) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  async function getUserColumn(
    column: string,
    account_id: string,
  ): Promise<unknown> {
    return await new Promise((resolve, reject) => {
      database.get_user_column(column, account_id, (err, result) => {
        if (err != null) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  async function insertProject(opts: {
    project_id: string;
    title?: string | null;
    description?: string | null;
  }): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_id, title, description, users, last_edited) VALUES ($1, $2, $3, $4, $5)",
      [
        opts.project_id,
        opts.title ?? null,
        opts.description ?? null,
        JSON.stringify({}),
        new Date(),
      ],
    );
  }

  async function insertAccount(opts: {
    account_id: string;
    email_address?: string;
  }): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO accounts (account_id, created, email_address) VALUES ($1, $2, $3)",
      [opts.account_id, new Date(), opts.email_address ?? "user@example.com"],
    );
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterEach(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM projects");
    await pool.query("DELETE FROM accounts");
  });

  afterAll(async () => {
    await testCleanup();
  });

  it("get_project returns only requested columns and strips null values", async () => {
    const project_id = uuid();
    await insertProject({
      project_id,
      title: "Test Project",
      description: null,
    });

    const result = await getProject({
      project_id,
      columns: ["project_id", "title", "description"],
    });

    expect(result).toBeDefined();
    expect(result?.project_id).toBe(project_id);
    expect(result?.title).toBe("Test Project");
    expect(
      Object.prototype.hasOwnProperty.call(result ?? {}, "description"),
    ).toBe(false);
  });

  it("get_project returns undefined for missing project", async () => {
    const result = await getProject({
      project_id: uuid(),
      columns: ["project_id"],
    });
    expect(result).toBeUndefined();
  });

  it("_get_project_column returns column value or undefined", async () => {
    const project_id = uuid();
    await insertProject({
      project_id,
      title: "Column Project",
    });

    const title = await getProjectColumn("title", project_id);
    const description = await getProjectColumn("description", project_id);

    expect(title).toBe("Column Project");
    expect(description).toBeUndefined();
  });

  it("_get_project_column rejects invalid project_id", async () => {
    await expect(getProjectColumn("title", "not-a-uuid")).rejects.toBe(
      "invalid project_id -- not-a-uuid: getting column title",
    );
  });

  it("get_user_column returns column value", async () => {
    const account_id = uuid();
    await insertAccount({
      account_id,
      email_address: "user@example.com",
    });

    const email = await getUserColumn("email_address", account_id);
    expect(email).toBe("user@example.com");
  });

  it("get_user_column rejects invalid account_id", async () => {
    await expect(getUserColumn("email_address", "bad-uuid")).rejects.toBe(
      "invalid account_id -- bad-uuid: getting column email_address",
    );
  });
});
