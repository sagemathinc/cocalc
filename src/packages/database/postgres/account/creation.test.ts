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

describe("Account creation methods", () => {
  const database: PostgreSQL = db();
  let pool: any;

  // Wrapper functions
  async function account_creation_actions_set_wrapper(opts: {
    email_address: string;
    action: any;
    ttl?: number;
  }): Promise<void> {
    return callback_opts(database.account_creation_actions.bind(database))(
      opts,
    );
  }

  async function account_creation_actions_get_wrapper(opts: {
    email_address: string;
  }): Promise<any[]> {
    return callback_opts(database.account_creation_actions.bind(database))(
      opts,
    );
  }

  async function account_creation_actions_success_wrapper(opts: {
    account_id: string;
  }): Promise<void> {
    return callback_opts(
      database.account_creation_actions_success.bind(database),
    )(opts);
  }

  async function do_account_creation_actions_wrapper(opts: {
    email_address: string;
    account_id: string;
  }): Promise<void> {
    return callback_opts(database.do_account_creation_actions.bind(database))(
      opts,
    );
  }

  beforeAll(async () => {
    pool = getPool();
    await initEphemeralDatabase();
  });

  afterAll(async () => {
    await testCleanup();
  });

  describe("account_creation_actions", () => {
    it("adds an action for an email address", async () => {
      const email = `test-${Date.now()}@example.com`;
      const action = {
        action: "add_to_project",
        project_id: uuid(),
        group: "collaborator",
      };

      await account_creation_actions_set_wrapper({
        email_address: email,
        action,
        ttl: 60 * 60 * 24, // 1 day
      });

      // Verify the action was added
      const { rows } = await pool.query(
        "SELECT action FROM account_creation_actions WHERE email_address = $1",
        [email],
      );

      expect(rows.length).toBe(1);
      expect(rows[0].action).toEqual(action);
    });

    it("retrieves actions for an email address", async () => {
      const email = `retrieve-${Date.now()}@example.com`;
      const action1 = {
        action: "add_to_project",
        project_id: uuid(),
        group: "collaborator",
      };
      const action2 = {
        action: "add_to_project",
        project_id: uuid(),
        group: "admin",
      };

      // Add two actions
      await account_creation_actions_set_wrapper({
        email_address: email,
        action: action1,
      });
      await account_creation_actions_set_wrapper({
        email_address: email,
        action: action2,
      });

      // Retrieve actions
      const actions = await account_creation_actions_get_wrapper({
        email_address: email,
      });

      expect(actions).toBeDefined();
      expect(actions.length).toBe(2);
      expect(actions).toContainEqual(action1);
      expect(actions).toContainEqual(action2);
    });

    it("does not return expired actions", async () => {
      const email = `expired-${Date.now()}@example.com`;
      const action = {
        action: "add_to_project",
        project_id: uuid(),
        group: "collaborator",
      };

      // Add an action with very short TTL
      await account_creation_actions_set_wrapper({
        email_address: email,
        action,
        ttl: -1, // Already expired
      });

      // Try to retrieve - should get empty array
      const actions = await account_creation_actions_get_wrapper({
        email_address: email,
      });

      expect(actions).toEqual([]);
    });

    it("returns empty array for email with no actions", async () => {
      const email = `no-actions-${Date.now()}@example.com`;

      const actions = await account_creation_actions_get_wrapper({
        email_address: email,
      });

      expect(actions).toEqual([]);
    });

    it("uses default TTL of 2 weeks when not specified", async () => {
      const email = `default-ttl-${Date.now()}@example.com`;
      const action = {
        action: "add_to_project",
        project_id: uuid(),
        group: "collaborator",
      };

      await account_creation_actions_set_wrapper({
        email_address: email,
        action,
      });

      // Verify the action was added with an expiration date
      const { rows } = await pool.query(
        "SELECT expire FROM account_creation_actions WHERE email_address = $1",
        [email],
      );

      expect(rows.length).toBe(1);
      expect(rows[0].expire).toBeDefined();

      // Verify expire is roughly 2 weeks in the future
      const expireDate = new Date(rows[0].expire);
      const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(
        expireDate.getTime() - twoWeeksFromNow.getTime(),
      );
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });
  });

  describe("account_creation_actions_success", () => {
    it("marks creation actions as done for an account", async () => {
      const accountId = uuid();
      const email = `success-${Date.now()}@example.com`;

      // Create account
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Initially creation_actions_done should be null or false
      let result = await pool.query(
        "SELECT creation_actions_done FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows[0].creation_actions_done).toBeFalsy();

      // Mark as done
      await account_creation_actions_success_wrapper({
        account_id: accountId,
      });

      // Verify it was marked as done
      result = await pool.query(
        "SELECT creation_actions_done FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows[0].creation_actions_done).toBe(true);
    });

    it("can be called multiple times safely", async () => {
      const accountId = uuid();
      const email = `multiple-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Call multiple times
      await account_creation_actions_success_wrapper({
        account_id: accountId,
      });
      await account_creation_actions_success_wrapper({
        account_id: accountId,
      });

      const result = await pool.query(
        "SELECT creation_actions_done FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows[0].creation_actions_done).toBe(true);
    });
  });

  describe("do_account_creation_actions", () => {
    it("executes add_to_project action", async () => {
      const accountId = uuid();
      const email = `execute-${Date.now()}@example.com`;
      const projectId = uuid();

      // Create account
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Create project
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Add action
      const action = {
        action: "add_to_project",
        project_id: projectId,
        group: "collaborator",
      };

      await account_creation_actions_set_wrapper({
        email_address: email,
        action,
      });

      // Execute actions
      await do_account_creation_actions_wrapper({
        email_address: email,
        account_id: accountId,
      });

      // Verify user was added to project
      const result = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(result.rows[0].users).toBeDefined();
      expect(result.rows[0].users[accountId]).toBeDefined();
      expect(result.rows[0].users[accountId].group).toBe("collaborator");

      // Verify creation_actions_done was set
      const accountResult = await pool.query(
        "SELECT creation_actions_done FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(accountResult.rows[0].creation_actions_done).toBe(true);
    });

    it("handles multiple actions", async () => {
      const accountId = uuid();
      const email = `multiple-actions-${Date.now()}@example.com`;
      const projectId1 = uuid();
      const projectId2 = uuid();

      // Create account and projects
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId1,
      ]);
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId2,
      ]);

      // Add multiple actions
      await account_creation_actions_set_wrapper({
        email_address: email,
        action: {
          action: "add_to_project",
          project_id: projectId1,
          group: "collaborator",
        },
      });

      await account_creation_actions_set_wrapper({
        email_address: email,
        action: {
          action: "add_to_project",
          project_id: projectId2,
          group: "owner",
        },
      });

      // Execute actions
      await do_account_creation_actions_wrapper({
        email_address: email,
        account_id: accountId,
      });

      // Verify user was added to both projects
      const result1 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId1],
      );
      expect(result1.rows[0].users[accountId].group).toBe("collaborator");

      const result2 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId2],
      );
      expect(result2.rows[0].users[accountId].group).toBe("owner");
    });

    it("handles empty actions list", async () => {
      const accountId = uuid();
      const email = `no-actions-exec-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Execute with no actions - should not throw
      await do_account_creation_actions_wrapper({
        email_address: email,
        account_id: accountId,
      });

      // Should still mark as done
      const result = await pool.query(
        "SELECT creation_actions_done FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows[0].creation_actions_done).toBe(true);
    });

    it("skips unknown action types", async () => {
      const accountId = uuid();
      const email = `unknown-action-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Add unknown action type
      await account_creation_actions_set_wrapper({
        email_address: email,
        action: {
          action: "unknown_action_type",
          some_data: "value",
        },
      });

      // Should not throw, just skip the unknown action
      await do_account_creation_actions_wrapper({
        email_address: email,
        account_id: accountId,
      });

      // Should still mark as done
      const result = await pool.query(
        "SELECT creation_actions_done FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows[0].creation_actions_done).toBe(true);
    });
  });
});
