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

describe("project host methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("set_project_host and get_project_host", () => {
    it("sets and retrieves project host", async () => {
      const pool = getPool();
      const projectId = uuid();
      const hostName = "compute-server-01";

      // Create project
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set project host
      const before = Date.now();
      const assigned = await callback_opts(
        database.set_project_host.bind(database),
      )({
        project_id: projectId,
        host: hostName,
      });
      const after = Date.now();

      // Verify assigned timestamp is returned and is recent
      expect(assigned).toBeInstanceOf(Date);
      expect(assigned.getTime()).toBeGreaterThanOrEqual(before);
      expect(assigned.getTime()).toBeLessThanOrEqual(after);

      // Get project host
      const result = await callback_opts(
        database.get_project_host.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toBe(hostName);
    });

    it("returns undefined for project without host", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const result = await callback_opts(
        database.get_project_host.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toBeUndefined();
    });

    it("updates host when set multiple times", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set first host
      const host1 = "server-01";
      const assigned1 = await callback_opts(
        database.set_project_host.bind(database),
      )({
        project_id: projectId,
        host: host1,
      });

      let result = await callback_opts(
        database.get_project_host.bind(database),
      )({
        project_id: projectId,
      });
      expect(result).toBe(host1);

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Set second host
      const host2 = "server-02";
      const assigned2 = await callback_opts(
        database.set_project_host.bind(database),
      )({
        project_id: projectId,
        host: host2,
      });

      // Verify second assignment is later
      expect(assigned2.getTime()).toBeGreaterThan(assigned1.getTime());

      result = await callback_opts(database.get_project_host.bind(database))({
        project_id: projectId,
      });
      expect(result).toBe(host2);
    });

    it("handles various host name formats", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const hostNames = [
        "simple-host",
        "host.with.dots",
        "host-with-dashes",
        "192.168.1.100",
        "host_with_underscores",
      ];

      for (const hostName of hostNames) {
        await callback_opts(database.set_project_host.bind(database))({
          project_id: projectId,
          host: hostName,
        });

        const result = await callback_opts(
          database.get_project_host.bind(database),
        )({
          project_id: projectId,
        });

        expect(result).toBe(hostName);
      }
    });
  });

  describe("unset_project_host", () => {
    it("unsets project host", async () => {
      const pool = getPool();
      const projectId = uuid();
      const hostName = "compute-server-01";

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set host
      await callback_opts(database.set_project_host.bind(database))({
        project_id: projectId,
        host: hostName,
      });

      // Verify host is set
      let result = await callback_opts(
        database.get_project_host.bind(database),
      )({
        project_id: projectId,
      });
      expect(result).toBe(hostName);

      // Unset host
      await callback_opts(database.unset_project_host.bind(database))({
        project_id: projectId,
      });

      // Verify host is unset
      result = await callback_opts(database.get_project_host.bind(database))({
        project_id: projectId,
      });
      expect(result).toBeUndefined();
    });

    it("unset succeeds even if host was never set", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Unset host (even though it was never set)
      await callback_opts(database.unset_project_host.bind(database))({
        project_id: projectId,
      });

      // Verify host is still undefined
      const result = await callback_opts(
        database.get_project_host.bind(database),
      )({
        project_id: projectId,
      });
      expect(result).toBeUndefined();
    });

    it("can set host again after unsetting", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set, unset, set again
      await callback_opts(database.set_project_host.bind(database))({
        project_id: projectId,
        host: "server-01",
      });

      await callback_opts(database.unset_project_host.bind(database))({
        project_id: projectId,
      });

      await callback_opts(database.set_project_host.bind(database))({
        project_id: projectId,
        host: "server-02",
      });

      const result = await callback_opts(
        database.get_project_host.bind(database),
      )({
        project_id: projectId,
      });
      expect(result).toBe("server-02");
    });
  });

  describe("edge cases", () => {
    it("handles empty string as host", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await callback_opts(database.set_project_host.bind(database))({
        project_id: projectId,
        host: "",
      });

      const result = await callback_opts(
        database.get_project_host.bind(database),
      )({
        project_id: projectId,
      });
      expect(result).toBe("");
    });

    it("preserves assigned timestamp in JSONB structure", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const assigned = await callback_opts(
        database.set_project_host.bind(database),
      )({
        project_id: projectId,
        host: "server-01",
      });

      // Query the full JSONB structure
      const { rows } = await pool.query(
        "SELECT host FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].host).toMatchObject({
        host: "server-01",
        assigned: expect.any(String), // ISO timestamp string in JSONB
      });

      // Verify assigned timestamp matches
      const storedAssigned = new Date(rows[0].host.assigned);
      expect(storedAssigned.getTime()).toBe(assigned.getTime());
    });
  });
});
