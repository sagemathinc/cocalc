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

describe("project status methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("set_project_status", () => {
    it("sets project status", async () => {
      const pool = getPool();
      const projectId = uuid();
      const status = {
        opened: new Date(),
        state: "running",
      };

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await callback_opts(database.set_project_status.bind(database))({
        project_id: projectId,
        status,
      });

      // Verify status was set
      const { rows } = await pool.query(
        "SELECT status FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].status).toMatchObject({
        state: "running",
      });
      expect(rows[0].status.opened).toBeDefined();
    });

    it("updates existing status", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, status) VALUES ($1, $2)",
        [projectId, JSON.stringify({ state: "starting" })],
      );

      const newStatus = {
        state: "running",
        cpu_usage: 50,
      };

      await callback_opts(database.set_project_status.bind(database))({
        project_id: projectId,
        status: newStatus,
      });

      const { rows } = await pool.query(
        "SELECT status FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].status).toEqual(newStatus);
    });

    it("handles complex status objects", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const status = {
        state: "running",
        compute_server: "server-01",
        metrics: {
          cpu: 45,
          memory: 1024,
          disk: 5000,
        },
        last_check: new Date(),
      };

      await callback_opts(database.set_project_status.bind(database))({
        project_id: projectId,
        status,
      });

      const { rows } = await pool.query(
        "SELECT status FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].status.state).toBe("running");
      expect(rows[0].status.compute_server).toBe("server-01");
      expect(rows[0].status.metrics).toMatchObject({
        cpu: 45,
        memory: 1024,
        disk: 5000,
      });
    });

    it("allows empty status object", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await callback_opts(database.set_project_status.bind(database))({
        project_id: projectId,
        status: {},
      });

      const { rows } = await pool.query(
        "SELECT status FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].status).toEqual({});
    });
  });
});
