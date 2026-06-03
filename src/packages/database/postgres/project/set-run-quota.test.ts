/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";

import type { PostgreSQL } from "../types";

describe("set_run_quota", () => {
  const database: PostgreSQL = db();

  async function setRunQuota(
    project_id: string,
    run_quota: Record<string, number>,
  ): Promise<void> {
    await database.set_run_quota(project_id, run_quota);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  it("merges new run_quota fields into existing data", async () => {
    const pool = getPool();
    const projectId = uuid();

    await pool.query(
      "INSERT INTO projects (project_id, run_quota) VALUES ($1, $2)",
      [projectId, JSON.stringify({ cpu: 1, ram: 2 })],
    );

    await setRunQuota(projectId, { disk: 3 });

    const { rows } = await pool.query(
      "SELECT run_quota FROM projects WHERE project_id = $1",
      [projectId],
    );

    expect(rows[0].run_quota).toMatchObject({
      cpu: 1,
      ram: 2,
      disk: 3,
    });
  });

  it("sets run_quota when it is initially null", async () => {
    const pool = getPool();
    const projectId = uuid();

    await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
      projectId,
    ]);

    await setRunQuota(projectId, { cpu: 4 });

    const { rows } = await pool.query(
      "SELECT run_quota FROM projects WHERE project_id = $1",
      [projectId],
    );

    expect(rows[0].run_quota).toMatchObject({
      cpu: 4,
    });
  });
});
