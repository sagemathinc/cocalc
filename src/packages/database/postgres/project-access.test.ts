/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";

import type { PostgreSQL } from "./types";

describe("project access methods", () => {
  const database: PostgreSQL = db();

  const userIsInProjectGroupLegacy = callback_opts(
    database.user_is_in_project_group.bind(database),
  ) as (opts: {
    account_id?: string;
    project_id: string;
    groups?: string[];
    cache?: boolean;
  }) => Promise<boolean>;
  const userIsCollaboratorLegacy = callback_opts(
    database.user_is_collaborator.bind(database),
  ) as (opts: { account_id: string; project_id: string }) => Promise<boolean>;
  const isAdminLegacy = callback_opts(
    database.is_admin.bind(database),
  ) as (opts: { account_id: string }) => Promise<boolean>;

  async function userIsInProjectGroup(opts: {
    account_id?: string;
    project_id: string;
    groups?: string[];
    cache?: boolean;
  }): Promise<boolean> {
    return userIsInProjectGroupLegacy(opts);
  }

  async function userIsCollaborator(opts: {
    account_id: string;
    project_id: string;
  }): Promise<boolean> {
    return userIsCollaboratorLegacy(opts);
  }

  async function isAdmin(opts: { account_id: string }): Promise<boolean> {
    return isAdminLegacy(opts);
  }

  async function insertProject(
    project_id: string,
    users: Record<string, { group?: string }>,
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_id, title, users, last_edited) VALUES ($1, $2, $3, $4)",
      [project_id, "Test Project", JSON.stringify(users), new Date()],
    );
  }

  async function insertAccount(opts: {
    account_id: string;
    groups?: string[];
  }): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO accounts (account_id, created, email_address, groups) VALUES ($1, $2, $3, $4)",
      [
        opts.account_id,
        new Date(),
        `${opts.account_id}@example.com`,
        opts.groups ?? null,
      ],
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
    database._close_test_query?.();
    await getPool().end();
  });

  it("user_is_in_project_group returns false when account_id is missing", async () => {
    const project_id = uuid();
    await insertProject(project_id, {});

    const result = await userIsInProjectGroup({
      project_id,
      groups: ["owner", "collaborator"],
    });

    expect(result).toBe(false);
  });

  it("user_is_in_project_group returns true for owners", async () => {
    const account_id = uuid();
    const project_id = uuid();
    await insertProject(project_id, {
      [account_id]: { group: "owner" },
    });

    const result = await userIsInProjectGroup({
      account_id,
      project_id,
      groups: ["owner", "collaborator"],
    });

    expect(result).toBe(true);
  });

  it("user_is_in_project_group falls back to admin when not a collaborator", async () => {
    const account_id = uuid();
    const project_id = uuid();
    await insertProject(project_id, {});
    await insertAccount({ account_id, groups: ["admin"] });

    const result = await userIsInProjectGroup({
      account_id,
      project_id,
      groups: ["owner", "collaborator"],
    });

    expect(result).toBe(true);
    expect(await isAdmin({ account_id })).toBe(true);
  });

  it("user_is_collaborator ignores admin if not a collaborator", async () => {
    const account_id = uuid();
    const project_id = uuid();
    await insertProject(project_id, {});
    await insertAccount({ account_id, groups: ["admin"] });

    const result = await userIsCollaborator({
      account_id,
      project_id,
    });

    expect(result).toBe(false);
  });

  it("user_is_collaborator returns true for project users", async () => {
    const account_id = uuid();
    const project_id = uuid();
    await insertProject(project_id, {
      [account_id]: { group: "collaborator" },
    });

    const result = await userIsCollaborator({
      account_id,
      project_id,
    });

    expect(result).toBe(true);
  });
});
