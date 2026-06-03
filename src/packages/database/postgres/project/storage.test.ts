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

describe("project storage methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("set_project_storage and get_project_storage", () => {
    it("sets and retrieves project storage", async () => {
      const pool = getPool();
      const projectId = uuid();
      const storageHost = "storage-server-01";

      // Create project
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set project storage
      const before = Date.now();
      const assigned = await callback_opts(
        database.set_project_storage.bind(database),
      )({
        project_id: projectId,
        host: storageHost,
      });
      const after = Date.now();

      // Verify assigned timestamp is returned and is recent
      expect(assigned).toBeInstanceOf(Date);
      expect(assigned.getTime()).toBeGreaterThanOrEqual(before);
      expect(assigned.getTime()).toBeLessThanOrEqual(after);

      // Get project storage
      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        host: storageHost,
        assigned: expect.any(String), // ISO timestamp in JSONB
      });

      // Verify assigned timestamp matches
      const storedAssigned = new Date(result.assigned);
      expect(storedAssigned.getTime()).toBe(assigned.getTime());
    });

    it("returns undefined for project without storage", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toBeUndefined();
    });

    it("allows setting same storage host again", async () => {
      const pool = getPool();
      const projectId = uuid();
      const storageHost = "storage-server-01";

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set storage first time
      const assigned1 = await callback_opts(
        database.set_project_storage.bind(database),
      )({
        project_id: projectId,
        host: storageHost,
      });

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Set same storage host again - should succeed
      const assigned2 = await callback_opts(
        database.set_project_storage.bind(database),
      )({
        project_id: projectId,
        host: storageHost,
      });

      // Second assignment should be later
      expect(assigned2.getTime()).toBeGreaterThan(assigned1.getTime());

      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });

      expect(result.host).toBe(storageHost);
    });

    it("rejects changing storage host to different value", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial storage
      await callback_opts(database.set_project_storage.bind(database))({
        project_id: projectId,
        host: "storage-01",
      });

      // Try to change to different host - should fail
      await expect(
        callback_opts(database.set_project_storage.bind(database))({
          project_id: projectId,
          host: "storage-02",
        }),
      ).rejects.toMatch(/change storage not implemented yet/);

      // Verify original storage unchanged
      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });
      expect(result.host).toBe("storage-01");
    });
  });

  describe("update_project_storage_save", () => {
    it("adds saved timestamp to existing storage", async () => {
      const pool = getPool();
      const projectId = uuid();
      const storageHost = "storage-server-01";

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial storage
      await callback_opts(database.set_project_storage.bind(database))({
        project_id: projectId,
        host: storageHost,
      });

      // Update with saved timestamp
      const before = Date.now();
      await callback_opts(database.update_project_storage_save.bind(database))({
        project_id: projectId,
      });
      const after = Date.now();

      // Get storage to verify saved timestamp was added
      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        host: storageHost,
        assigned: expect.any(String),
        saved: expect.any(String),
      });

      const savedTime = new Date(result.saved).getTime();
      expect(savedTime).toBeGreaterThanOrEqual(before);
      expect(savedTime).toBeLessThanOrEqual(after);
    });

    it("updates saved timestamp on subsequent calls", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial storage
      await callback_opts(database.set_project_storage.bind(database))({
        project_id: projectId,
        host: "storage-01",
      });

      // First save
      await callback_opts(database.update_project_storage_save.bind(database))({
        project_id: projectId,
      });

      const result1 = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });
      const saved1 = new Date(result1.saved).getTime();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second save
      await callback_opts(database.update_project_storage_save.bind(database))({
        project_id: projectId,
      });

      const result2 = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });
      const saved2 = new Date(result2.saved).getTime();

      // Second save should be later
      expect(saved2).toBeGreaterThan(saved1);

      // Host and assigned should remain unchanged
      expect(result2.host).toBe(result1.host);
      expect(result2.assigned).toBe(result1.assigned);
    });

    it("preserves existing storage fields when adding saved", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial storage
      const assigned = await callback_opts(
        database.set_project_storage.bind(database),
      )({
        project_id: projectId,
        host: "storage-01",
      });

      // Add saved timestamp
      await callback_opts(database.update_project_storage_save.bind(database))({
        project_id: projectId,
      });

      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });

      // All fields should be present
      expect(result.host).toBe("storage-01");
      expect(new Date(result.assigned).getTime()).toBe(assigned.getTime());
      expect(result.saved).toBeDefined();
    });

    it("works even if storage was never set (creates storage JSONB)", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Update save without setting storage first
      await callback_opts(database.update_project_storage_save.bind(database))({
        project_id: projectId,
      });

      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });

      // Should have just the saved field
      expect(result).toMatchObject({
        saved: expect.any(String),
      });
      expect(result.host).toBeUndefined();
      expect(result.assigned).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles empty string as storage host", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const assigned = await callback_opts(
        database.set_project_storage.bind(database),
      )({
        project_id: projectId,
        host: "",
      });

      expect(assigned).toBeInstanceOf(Date);

      const result = await callback_opts(
        database.get_project_storage.bind(database),
      )({
        project_id: projectId,
      });

      expect(result.host).toBe("");
    });

    it("allows setting same empty string storage host again", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await callback_opts(database.set_project_storage.bind(database))({
        project_id: projectId,
        host: "",
      });

      // Should succeed since it's the same (empty) host
      const assigned = await callback_opts(
        database.set_project_storage.bind(database),
      )({
        project_id: projectId,
        host: "",
      });

      expect(assigned).toBeInstanceOf(Date);
    });
  });
});
