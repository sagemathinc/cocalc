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

describe("project user query methods", () => {
  const database: PostgreSQL = db();

  const getProjectIdsWithUserLegacy = callback_opts(
    database.get_project_ids_with_user.bind(database),
  ) as (opts: { account_id: string; is_owner?: boolean }) => Promise<string[]>;
  const getAccountIdsUsingProjectLegacy = callback_opts(
    database.get_account_ids_using_project.bind(database),
  ) as (opts: { project_id: string }) => Promise<string[]>;

  async function getProjectIdsWithUser(opts: {
    account_id: string;
    is_owner?: boolean;
  }): Promise<string[]> {
    return getProjectIdsWithUserLegacy(opts);
  }

  async function getAccountIdsUsingProject(opts: {
    project_id: string;
  }): Promise<string[]> {
    return getAccountIdsUsingProjectLegacy(opts);
  }

  async function insertProject(
    project_id: string,
    users: Record<string, unknown> | null,
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_id, title, users, last_edited) VALUES ($1, $2, $3, $4)",
      [
        project_id,
        "Test Project",
        users == null ? null : JSON.stringify(users),
        new Date(),
      ],
    );
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterEach(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM projects");
  });

  afterAll(async () => {
    await testCleanup();
  });

  it("get_project_ids_with_user returns projects that include the user", async () => {
    const account_id = uuid();
    const projectA = uuid();
    const projectB = uuid();
    const projectC = uuid();

    await insertProject(projectA, {
      [account_id]: { group: "collaborator" },
    });
    await insertProject(projectB, {
      [account_id]: { group: "owner" },
    });
    await insertProject(projectC, {
      [uuid()]: { group: "collaborator" },
    });

    const results = await getProjectIdsWithUser({ account_id });
    const resultSet = new Set(results);

    expect(resultSet.has(projectA)).toBe(true);
    expect(resultSet.has(projectB)).toBe(true);
    expect(resultSet.has(projectC)).toBe(false);
  });

  it("get_project_ids_with_user honors is_owner", async () => {
    const account_id = uuid();
    const projectA = uuid();
    const projectB = uuid();

    await insertProject(projectA, {
      [account_id]: { group: "collaborator" },
    });
    await insertProject(projectB, {
      [account_id]: { group: "owner" },
    });

    const results = await getProjectIdsWithUser({ account_id, is_owner: true });
    expect(results).toEqual([projectB]);
  });

  it("get_account_ids_using_project excludes invite groups", async () => {
    const project_id = uuid();
    const owner = uuid();
    const collaborator = uuid();
    const invite = uuid();
    const invited = uuid();
    const noGroup = uuid();

    await insertProject(project_id, {
      [owner]: { group: "owner" },
      [collaborator]: { group: "collaborator" },
      [invite]: { group: "invite" },
      [invited]: { group: "invited-collaborator" },
      [noGroup]: {},
    });

    const results = await getAccountIdsUsingProject({ project_id });
    const resultSet = new Set(results);

    expect(resultSet.has(owner)).toBe(true);
    expect(resultSet.has(collaborator)).toBe(true);
    expect(resultSet.has(invite)).toBe(false);
    expect(resultSet.has(invited)).toBe(false);
    expect(resultSet.has(noGroup)).toBe(false);
    expect(resultSet.size).toBe(2);
  });
});
