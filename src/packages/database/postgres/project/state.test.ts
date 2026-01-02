/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";

describe("project state and storage request methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("set_project_storage_request and get_project_storage_request", () => {
    it("sets and retrieves storage request with save action", async () => {
      const pool = getPool();
      const projectId = uuid();

      // Create project
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set storage request
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "save",
      });

      // Get storage request
      const result = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        action: "save",
      });
      expect(result.requested).toBeDefined();
      expect(new Date(result.requested)).toBeInstanceOf(Date);
    });

    it("sets storage request with target for move action", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const targetHost = "storage-server-01";
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "move",
        target: targetHost,
      });

      const result = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        action: "move",
        target: targetHost,
      });
      expect(result.requested).toBeDefined();
      expect(new Date(result.requested)).toBeInstanceOf(Date);
    });

    it("handles different storage actions", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Test close action
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "close",
      });

      let result = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });
      expect(result.action).toBe("close");

      // Test open action with target
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "open",
        target: "storage-02",
      });

      result = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });
      expect(result).toMatchObject({
        action: "open",
        target: "storage-02",
      });
    });

    it("returns undefined for project without storage request", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const result = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toBeUndefined();
    });
  });

  describe("set_project_state and get_project_state", () => {
    it("sets and retrieves project state", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const now = new Date();
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
        time: now,
      });

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        state: "running",
      });
      expect(new Date(result.time).getTime()).toBe(now.getTime());
    });

    it("sets state with error message", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const errorMsg = "Failed to start: out of memory";
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
        error: errorMsg,
      });

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        state: "running",
        error: errorMsg,
      });
    });

    it("sets state with IP address", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const ipAddress = "192.168.1.100";
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
        ip: ipAddress,
      });

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        state: "running",
        ip: ipAddress,
      });
    });

    it("rejects invalid state type", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await expect(
        callback_opts(database.set_project_state.bind(database))({
          project_id: projectId,
          state: 123 as any, // Invalid: number instead of string
        }),
      ).rejects.toMatch("invalid state type");
    });

    it("rejects invalid state value", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await expect(
        callback_opts(database.set_project_state.bind(database))({
          project_id: projectId,
          state: "invalid_state_name",
        }),
      ).rejects.toMatch("not a valid state");
    });

    it("handles multiple state transitions", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial state
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "opened",
      });

      let result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });
      expect(result.state).toBe("opened");

      // Transition to running
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
      });

      result = await callback_opts(database.get_project_state.bind(database))({
        project_id: projectId,
      });
      expect(result.state).toBe("running");

      // Transition to closed
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "closed",
      });

      result = await callback_opts(database.get_project_state.bind(database))({
        project_id: projectId,
      });
      expect(result.state).toBe("closed");
    });

    it("returns undefined for project without state", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toBeUndefined();
    });

    it("sets state with both error and IP", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const errorMsg = "Network timeout";
      const ipAddress = "10.0.0.1";
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
        error: errorMsg,
        ip: ipAddress,
      });

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toMatchObject({
        state: "running",
        error: errorMsg,
        ip: ipAddress,
      });
    });

    it("overwrites previous state completely", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial state with error and IP
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "starting",
        error: "old error",
        ip: "192.168.1.1",
      });

      // Overwrite with new state without error/IP
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
      });

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      // Old error and IP should be gone
      expect(result.state).toBe("running");
      expect(result.error).toBeUndefined();
      expect(result.ip).toBeUndefined();
    });

    it("accepts all valid COMPUTE_STATES", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Derive valid states dynamically from COMPUTE_STATES
      const validStates = Object.keys(COMPUTE_STATES);

      for (const state of validStates) {
        await callback_opts(database.set_project_state.bind(database))({
          project_id: projectId,
          state,
        });

        const result = await callback_opts(
          database.get_project_state.bind(database),
        )({
          project_id: projectId,
        });

        expect(result.state).toBe(state);
      }
    });

    it("uses custom time value when provided", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const customTime = new Date("2024-01-15T10:30:00Z");
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
        time: customTime,
      });

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      expect(new Date(result.time).getTime()).toBe(customTime.getTime());
    });

    it("uses default time when not provided", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const before = Date.now();
      await callback_opts(database.set_project_state.bind(database))({
        project_id: projectId,
        state: "running",
      });
      const after = Date.now();

      const result = await callback_opts(
        database.get_project_state.bind(database),
      )({
        project_id: projectId,
      });

      const resultTime = new Date(result.time).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after);
    });
  });

  describe("set_project_storage_request edge cases", () => {
    it("overwrites previous storage request", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set initial request
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "save",
      });

      // Overwrite with new request
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "close",
      });

      const result = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });

      expect(result.action).toBe("close");
      expect(result.target).toBeUndefined();
    });

    it("removes target when overwriting with action without target", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Set request with target
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "move",
        target: "old-target",
      });

      // Overwrite with action that has no target
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "save",
      });

      const result = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });

      expect(result.action).toBe("save");
      expect(result.target).toBeUndefined();
    });

    it("preserves requested timestamp on each update", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const before1 = Date.now();
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "save",
      });
      const after1 = Date.now();

      const result1 = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });

      const time1 = new Date(result1.requested).getTime();
      expect(time1).toBeGreaterThanOrEqual(before1);
      expect(time1).toBeLessThanOrEqual(after1);

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const before2 = Date.now();
      await callback_opts(database.set_project_storage_request.bind(database))({
        project_id: projectId,
        action: "close",
      });
      const after2 = Date.now();

      const result2 = await callback_opts(
        database.get_project_storage_request.bind(database),
      )({
        project_id: projectId,
      });

      const time2 = new Date(result2.requested).getTime();
      expect(time2).toBeGreaterThanOrEqual(before2);
      expect(time2).toBeLessThanOrEqual(after2);
      expect(time2).toBeGreaterThan(time1);
    });
  });
});
