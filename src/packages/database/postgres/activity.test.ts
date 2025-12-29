/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "./types";

describe("Activity tracking methods", () => {
  const database: PostgreSQL = db();
  let test_account_id: string;
  let test_project_id: string;

  async function touchProjectInternalWrapper(
    project_id: string,
    account_id: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      database._touch_project(project_id, account_id, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function touchProjectWrapper(project_id: string): Promise<void> {
    await callback_opts(database.touch_project.bind(database))({
      project_id,
    });
  }

  async function touchWrapper(opts: {
    account_id: string;
    project_id?: string;
    path?: string;
    action?: string;
    ttl_s?: number;
  }): Promise<void> {
    await callback_opts(database.touch.bind(database))(opts);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});

    // Create test account
    test_account_id = uuid();
    await getPool().query(
      `INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)`,
      [test_account_id, `test-${test_account_id}@example.com`],
    );

    // Create test project
    test_project_id = uuid();
    await getPool().query(
      `INSERT INTO projects (project_id, title, description) VALUES ($1, $2, $3)`,
      [test_project_id, "Test Project", "{}"],
    );
  }, 15000);

  afterAll(async () => {
    database._clear_throttles();
    db()._close_test_query?.();
    await getPool().end();
  });

  describe("touchProjectInternal (_touch_project)", () => {
    it("updates project last_edited and last_active", async () => {
      const account_id = uuid();

      // Create account
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)`,
        [account_id, `test-${account_id}@example.com`],
      );

      // Create project
      const project_id = uuid();
      await getPool().query(
        `INSERT INTO projects (project_id, title, description) VALUES ($1, $2, $3)`,
        [project_id, "Touch Test Project", "{}"],
      );

      const before = Date.now();

      await touchProjectInternalWrapper(project_id, account_id);

      // Check that last_edited was updated
      const result = await getPool().query(
        `SELECT last_edited, last_active FROM projects WHERE project_id = $1`,
        [project_id],
      );

      expect(result.rows.length).toBe(1);
      const { last_edited, last_active } = result.rows[0];

      // Verify last_edited is recent
      expect(last_edited).toBeInstanceOf(Date);
      expect(last_edited.getTime()).toBeGreaterThanOrEqual(before);

      // Verify last_active has account_id with recent timestamp
      expect(last_active).toBeDefined();
      expect(last_active[account_id]).toBeDefined();
      const accountActiveTime = new Date(last_active[account_id]);
      expect(accountActiveTime.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("throttles duplicate calls within 60 seconds", async () => {
      database._clear_throttles();

      const account_id = uuid();
      const project_id = uuid();

      // Create account and project
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)`,
        [account_id, `test-${account_id}@example.com`],
      );
      await getPool().query(
        `INSERT INTO projects (project_id, title, description) VALUES ($1, $2, $3)`,
        [project_id, "Throttle Test Project", "{}"],
      );

      // First call should update
      await touchProjectInternalWrapper(project_id, account_id);

      const result1 = await getPool().query(
        `SELECT last_edited FROM projects WHERE project_id = $1`,
        [project_id],
      );
      const firstUpdate = result1.rows[0].last_edited;

      // Wait a tiny bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second call within 60s should be throttled (no update)
      await touchProjectInternalWrapper(project_id, account_id);

      const result2 = await getPool().query(
        `SELECT last_edited FROM projects WHERE project_id = $1`,
        [project_id],
      );
      const secondUpdate = result2.rows[0].last_edited;

      // Time should be identical (throttled)
      expect(secondUpdate.getTime()).toBe(firstUpdate.getTime());
    });

    it("allows updates from different accounts", async () => {
      database._clear_throttles();

      const account_id1 = uuid();
      const account_id2 = uuid();
      const project_id = uuid();

      // Create accounts and project
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address) VALUES ($1, $2), ($3, $4)`,
        [
          account_id1,
          `test-${account_id1}@example.com`,
          account_id2,
          `test-${account_id2}@example.com`,
        ],
      );
      await getPool().query(
        `INSERT INTO projects (project_id, title, description) VALUES ($1, $2, $3)`,
        [project_id, "Multi-User Test Project", "{}"],
      );

      // Touch from first account
      await touchProjectInternalWrapper(project_id, account_id1);

      // Touch from second account
      await touchProjectInternalWrapper(project_id, account_id2);

      const result = await getPool().query(
        `SELECT last_active FROM projects WHERE project_id = $1`,
        [project_id],
      );

      // Both accounts should be in last_active
      const { last_active } = result.rows[0];
      expect(last_active[account_id1]).toBeDefined();
      expect(last_active[account_id2]).toBeDefined();
    });
  });

  describe("touchProject (touch_project)", () => {
    it("updates project last_edited without account tracking", async () => {
      database._clear_throttles();

      const project_id = uuid();

      // Create project with null last_edited
      await getPool().query(
        `INSERT INTO projects (project_id, title, description, last_edited) VALUES ($1, $2, $3, NULL)`,
        [project_id, "Touch Project Test", "{}"],
      );

      await touchProjectWrapper(project_id);

      const result = await getPool().query(
        `SELECT last_edited FROM projects WHERE project_id = $1`,
        [project_id],
      );

      expect(result.rows.length).toBe(1);
      const { last_edited } = result.rows[0];
      expect(last_edited).toBeInstanceOf(Date);
      expect(last_edited).not.toBeNull();
    });

    it("throttles duplicate calls within 30 seconds", async () => {
      database._clear_throttles();

      const project_id = uuid();

      // Create project
      await getPool().query(
        `INSERT INTO projects (project_id, title, description) VALUES ($1, $2, $3)`,
        [project_id, "Throttle Touch Project Test", "{}"],
      );

      // First call
      await touchProjectWrapper(project_id);

      const result1 = await getPool().query(
        `SELECT last_edited FROM projects WHERE project_id = $1`,
        [project_id],
      );
      const firstUpdate = result1.rows[0].last_edited;

      // Wait a tiny bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second call within 30s should be throttled
      await touchProjectWrapper(project_id);

      const result2 = await getPool().query(
        `SELECT last_edited FROM projects WHERE project_id = $1`,
        [project_id],
      );
      const secondUpdate = result2.rows[0].last_edited;

      // Should be throttled (same time)
      expect(secondUpdate.getTime()).toBe(firstUpdate.getTime());
    });
  });

  describe("touch", () => {
    it("touches account only when no project_id", async () => {
      database._clear_throttles();

      const account_id = uuid();

      // Create account with null last_active
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address, last_active) VALUES ($1, $2, NULL)`,
        [account_id, `test-${account_id}@example.com`],
      );

      await touchWrapper({ account_id });

      // Verify account was touched
      const result = await getPool().query(
        `SELECT last_active FROM accounts WHERE account_id = $1`,
        [account_id],
      );

      expect(result.rows.length).toBe(1);
      const { last_active } = result.rows[0];
      expect(last_active).toBeInstanceOf(Date);
      expect(last_active).not.toBeNull();
    });

    it("touches account and project when project_id provided", async () => {
      database._clear_throttles();

      const account_id = uuid();
      const project_id = uuid();

      // Create account and project with null timestamps
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address, last_active) VALUES ($1, $2, NULL)`,
        [account_id, `test-${account_id}@example.com`],
      );
      await getPool().query(
        `INSERT INTO projects (project_id, title, description, last_edited) VALUES ($1, $2, $3, NULL)`,
        [project_id, "Touch Both Test", "{}"],
      );

      await touchWrapper({ account_id, project_id });

      // Verify account was touched
      const accountResult = await getPool().query(
        `SELECT last_active FROM accounts WHERE account_id = $1`,
        [account_id],
      );
      expect(accountResult.rows[0].last_active).not.toBeNull();

      // Verify project was touched
      const projectResult = await getPool().query(
        `SELECT last_edited, last_active FROM projects WHERE project_id = $1`,
        [project_id],
      );
      expect(projectResult.rows[0].last_edited).not.toBeNull();
      expect(projectResult.rows[0].last_active[account_id]).toBeDefined();
    });

    it("touches account, project, and file when path provided", async () => {
      database._clear_throttles();

      const account_id = uuid();
      const project_id = uuid();
      const path = "test-file.txt";

      // Create account and project
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)`,
        [account_id, `test-${account_id}@example.com`],
      );
      await getPool().query(
        `INSERT INTO projects (project_id, title, description) VALUES ($1, $2, $3)`,
        [project_id, "Touch All Test", "{}"],
      );

      await touchWrapper({ account_id, project_id, path, action: "edit" });

      // Verify file_use was recorded
      const fileResult = await getPool().query(
        `SELECT * FROM file_use WHERE project_id = $1 AND path = $2`,
        [project_id, path],
      );

      expect(fileResult.rows.length).toBe(1);
      expect(fileResult.rows[0].users[account_id]).toBeDefined();
      expect(fileResult.rows[0].users[account_id].edit).toBeDefined();
    });

    it("respects custom ttl_s throttle parameter", async () => {
      database._clear_throttles();

      const account_id = uuid();

      // Create account
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)`,
        [account_id, `test-${account_id}@example.com`],
      );

      // First call with ttl_s = 60
      await touchWrapper({ account_id, ttl_s: 60 });

      const result1 = await getPool().query(
        `SELECT last_active FROM accounts WHERE account_id = $1`,
        [account_id],
      );
      const firstUpdate = result1.rows[0].last_active;

      // Wait a tiny bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second call within ttl_s should be throttled
      await touchWrapper({ account_id, ttl_s: 60 });

      const result2 = await getPool().query(
        `SELECT last_active FROM accounts WHERE account_id = $1`,
        [account_id],
      );
      const secondUpdate = result2.rows[0].last_active;

      // Should be throttled (same time)
      expect(secondUpdate.getTime()).toBe(firstUpdate.getTime());
    });

    it("defaults to ttl_s = 50 when not specified", async () => {
      database._clear_throttles();

      const account_id = uuid();

      // Create account
      await getPool().query(
        `INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)`,
        [account_id, `test-${account_id}@example.com`],
      );

      // First call without ttl_s (defaults to 50)
      await touchWrapper({ account_id });

      // Second call should be throttled
      const result1 = await getPool().query(
        `SELECT last_active FROM accounts WHERE account_id = $1`,
        [account_id],
      );
      const firstUpdate = result1.rows[0].last_active;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await touchWrapper({ account_id });

      const result2 = await getPool().query(
        `SELECT last_active FROM accounts WHERE account_id = $1`,
        [account_id],
      );
      const secondUpdate = result2.rows[0].last_active;

      expect(secondUpdate.getTime()).toBe(firstUpdate.getTime());
    });
  });
});
