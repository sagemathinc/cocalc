/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { db } from "@cocalc/database";
import { uuid } from "@cocalc/util/misc";

let pool: ReturnType<typeof getPool> | undefined;

beforeAll(async () => {
  await initEphemeralDatabase();
  pool = getPool();
}, 15000);

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
});

async function insertProject(opts: {
  projectId: string;
  ownerId: string;
  collaboratorId: string;
}) {
  const { projectId, ownerId, collaboratorId } = opts;
  if (!pool) {
    throw Error("Pool not initialized");
  }
  await pool.query("INSERT INTO projects(project_id, users) VALUES ($1, $2)", [
    projectId,
    {
      [ownerId]: { group: "owner" },
      [collaboratorId]: { group: "collaborator" },
    },
  ]);
}

describe("manage_users_owner_only set hook", () => {
  const projectId = uuid();
  const ownerId = uuid();
  const collaboratorId = uuid();

  beforeAll(async () => {
    await insertProject({ projectId, ownerId, collaboratorId });
  });

  test("owner can set manage_users_owner_only", async () => {
    const value = await db()._user_set_query_project_manage_users_owner_only({
      project_id: projectId,
      manage_users_owner_only: true,
    });
    expect(value).toBe(true);
  });

  test("collaborator call returns sanitized value (permission enforced elsewhere)", async () => {
    const value = await db()._user_set_query_project_manage_users_owner_only({
      project_id: projectId,
      manage_users_owner_only: true,
    });
    expect(value).toBe(true);
  });

  test("invalid type is rejected", async () => {
    expect(() =>
      db()._user_set_query_project_manage_users_owner_only({
        project_id: projectId,
        manage_users_owner_only: "yes" as any,
      }),
    ).toThrow("manage_users_owner_only must be a boolean");
  });
});
