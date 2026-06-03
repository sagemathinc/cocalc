/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { DEFAULT_QUOTAS } from "@cocalc/util/schema";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";

describe("project settings methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("get_project_settings and set_project_settings", () => {
    it("returns DEFAULT_QUOTAS for project with no settings", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const result = await callback_opts(
        database.get_project_settings.bind(database),
      )({
        project_id: projectId,
      });

      // Should return a copy of DEFAULT_QUOTAS
      expect(result).toEqual(DEFAULT_QUOTAS);
      // Should be a copy, not the same object
      expect(result).not.toBe(DEFAULT_QUOTAS);
    });

    it("sets and retrieves project settings", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const settings = {
        cpu_shares: 512,
        memory: 2048,
      };

      await callback_opts(database.set_project_settings.bind(database))({
        project_id: projectId,
        settings,
      });

      const result = await callback_opts(
        database.get_project_settings.bind(database),
      )({
        project_id: projectId,
      });

      // Should have the settings we set
      expect(result.cpu_shares).toBe(512);
      expect(result.memory).toBe(2048);
      // Should also have defaults for fields we didn't set
      expect(result.disk_quota).toBe(DEFAULT_QUOTAS.disk_quota);
    });

    it("merges settings with DEFAULT_QUOTAS", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set only some settings
      await callback_opts(database.set_project_settings.bind(database))({
        project_id: projectId,
        settings: {
          memory: 4096,
        },
      });

      const result = await callback_opts(
        database.get_project_settings.bind(database),
      )({
        project_id: projectId,
      });

      // Should have our custom value
      expect(result.memory).toBe(4096);
      // Should have defaults for other fields
      expect(result.cpu_shares).toBe(DEFAULT_QUOTAS.cpu_shares);
      expect(result.disk_quota).toBe(DEFAULT_QUOTAS.disk_quota);
    });

    it("updates existing settings", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial settings
      await callback_opts(database.set_project_settings.bind(database))({
        project_id: projectId,
        settings: {
          memory: 2048,
          cpu_shares: 512,
        },
      });

      // Update with new settings
      await callback_opts(database.set_project_settings.bind(database))({
        project_id: projectId,
        settings: {
          memory: 4096,
        },
      });

      const result = await callback_opts(
        database.get_project_settings.bind(database),
      )({
        project_id: projectId,
      });

      // Memory should be updated
      expect(result.memory).toBe(4096);
      // cpu_shares should still be there (jsonb_merge preserves other fields)
      expect(result.cpu_shares).toBe(512);
    });

    it("handles numeric strings in settings", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Manually insert settings with string values
      await pool.query(
        "UPDATE projects SET settings = $1 WHERE project_id = $2",
        [JSON.stringify({ memory: "2048", cpu_shares: "512" }), projectId],
      );

      const result = await callback_opts(
        database.get_project_settings.bind(database),
      )({
        project_id: projectId,
      });

      // Should coerce string values to numbers
      expect(result.memory).toBe(2048);
      expect(result.cpu_shares).toBe(512);
      expect(typeof result.memory).toBe("number");
      expect(typeof result.cpu_shares).toBe("number");
    });

    it("allows setting subset of quota fields", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await callback_opts(database.set_project_settings.bind(database))({
        project_id: projectId,
        settings: {
          network: 1,
        },
      });

      const result = await callback_opts(
        database.get_project_settings.bind(database),
      )({
        project_id: projectId,
      });

      expect(result.network).toBe(1);
      expect(result.memory).toBe(DEFAULT_QUOTAS.memory);
    });
  });
});
