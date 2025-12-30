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

describe("Project upgrades methods", () => {
  const database: PostgreSQL = db();
  let pool: any;

  // Wrapper functions that call the CoffeeScript db() methods.
  async function get_project_quotas_wrapper(opts: {
    project_id: string;
  }): Promise<any> {
    return callback_opts(database.get_project_quotas.bind(database))(opts);
  }

  async function get_user_project_upgrades_wrapper(opts: {
    account_id: string;
  }): Promise<Record<string, any>> {
    return callback_opts(database.get_user_project_upgrades.bind(database))(
      opts,
    );
  }

  async function ensure_user_project_upgrades_are_valid_wrapper(opts: {
    account_id: string;
    fix?: boolean;
  }): Promise<Record<string, any>> {
    return callback_opts(
      database.ensure_user_project_upgrades_are_valid.bind(database),
    )(opts);
  }

  async function ensure_all_user_project_upgrades_are_valid_wrapper(opts: {
    limit?: number;
  }): Promise<void> {
    return callback_opts(
      database.ensure_all_user_project_upgrades_are_valid.bind(database),
    )(opts);
  }

  async function get_project_upgrades_wrapper(opts: {
    project_id: string;
  }): Promise<any> {
    return callback_opts(database.get_project_upgrades.bind(database))(opts);
  }

  async function remove_all_user_project_upgrades_wrapper(opts: {
    account_id: string;
    projects?: string[];
  }): Promise<void> {
    return callback_opts(
      database.remove_all_user_project_upgrades.bind(database),
    )(opts);
  }

  beforeAll(async () => {
    pool = getPool();
    await initEphemeralDatabase();
  });

  afterAll(async () => {
    await testCleanup();
  });

  describe("get_project_quotas", () => {
    it("returns quotas for a project with basic settings", async () => {
      const projectId = uuid();

      // Create project with basic settings
      await pool.query(
        "INSERT INTO projects (project_id, settings, users) VALUES ($1, $2, $3)",
        [projectId, {}, {}],
      );

      const quotas = await get_project_quotas_wrapper({
        project_id: projectId,
      });

      expect(quotas).toBeDefined();
      expect(typeof quotas).toBe("object");
      // quota() function returns an object with various quota fields
      expect(quotas).toHaveProperty("member_host");
    });

    it("returns quotas combining settings and upgrades", async () => {
      const projectId = uuid();
      const accountId = uuid();

      // Create project with custom settings and user upgrades
      await pool.query(
        "INSERT INTO projects (project_id, settings, users) VALUES ($1, $2, $3)",
        [
          projectId,
          { cores: 1 },
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2, memory: 4000 },
            },
          },
        ],
      );

      const quotas = await get_project_quotas_wrapper({
        project_id: projectId,
      });

      expect(quotas).toBeDefined();
      expect(typeof quotas).toBe("object");
    });

    it("handles project with site_license", async () => {
      const projectId = uuid();
      const licenseId = uuid();

      // Create project with site license
      await pool.query(
        "INSERT INTO projects (project_id, settings, users, site_license) VALUES ($1, $2, $3, $4)",
        [projectId, {}, {}, { [licenseId]: {} }],
      );

      const quotas = await get_project_quotas_wrapper({
        project_id: projectId,
      });

      expect(quotas).toBeDefined();
    });

    it("handles project with null users", async () => {
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, settings) VALUES ($1, $2)",
        [projectId, {}],
      );

      const quotas = await get_project_quotas_wrapper({
        project_id: projectId,
      });

      expect(quotas).toBeDefined();
    });
  });

  describe("get_user_project_upgrades", () => {
    it("returns empty object when user has no projects", async () => {
      const accountId = uuid();

      const upgrades = await get_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      expect(upgrades).toEqual({});
    });

    it("returns empty object when user has projects but no upgrades", async () => {
      const accountId = uuid();
      const projectId = uuid();

      // Create project with user but no upgrades
      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [projectId, { [accountId]: { group: "owner" } }],
      );

      const upgrades = await get_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      expect(upgrades).toEqual({});
    });

    it("returns upgrades for single project", async () => {
      const accountId = uuid();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2, memory: 4000 },
            },
          },
        ],
      );

      const upgrades = await get_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      expect(Object.keys(upgrades).length).toBe(1);
      expect(upgrades[projectId]).toEqual({ cores: 2, memory: 4000 });
    });

    it("returns upgrades for multiple projects", async () => {
      const accountId = uuid();
      const projectId1 = uuid();
      const projectId2 = uuid();
      const projectId3 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId1,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2, memory: 4000 },
            },
          },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId2,
          { [accountId]: { group: "owner", upgrades: { disk: 1000 } } },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId3,
          {
            [accountId]: {
              group: "collaborator",
              upgrades: { network: 1, member_host: 1 },
            },
          },
        ],
      );

      const upgrades = await get_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      expect(Object.keys(upgrades).length).toBe(3);
      expect(upgrades[projectId1]).toEqual({ cores: 2, memory: 4000 });
      expect(upgrades[projectId2]).toEqual({ disk: 1000 });
      expect(upgrades[projectId3]).toEqual({ network: 1, member_host: 1 });
    });

    it("does not return projects where user has no upgrades", async () => {
      const accountId = uuid();
      const projectId1 = uuid();
      const projectId2 = uuid();

      // Create one project with upgrades, one without
      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId1,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 1 },
            },
          },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [projectId2, { [accountId]: { group: "owner" } }],
      );

      const upgrades = await get_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      expect(Object.keys(upgrades).length).toBe(1);
      expect(upgrades[projectId1]).toEqual({ cores: 1 });
      expect(upgrades[projectId2]).toBeUndefined();
    });

    it("handles user with null upgrades field", async () => {
      const accountId = uuid();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: null,
            },
          },
        ],
      );

      const upgrades = await get_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      // CoffeeScript returns project_id with null value instead of filtering it out
      expect(upgrades[projectId]).toBeNull();
    });
  });

  describe("ensure_user_project_upgrades_are_valid", () => {
    it("returns empty excess when user has no upgrades", async () => {
      const accountId = uuid();
      const email = `test-${Date.now()}@example.com`;

      // Create account without Stripe
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      const excess = await ensure_user_project_upgrades_are_valid_wrapper({
        account_id: accountId,
        fix: false,
      });

      expect(excess).toEqual({});
    });

    it("detects excess upgrades when user has no subscription", async () => {
      const accountId = uuid();
      const email = `excess-${Date.now()}@example.com`;
      const projectId = uuid();

      // Create account without Stripe
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Create project with upgrades (but user has no subscription)
      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2, memory: 4000 },
            },
          },
        ],
      );

      const excess = await ensure_user_project_upgrades_are_valid_wrapper({
        account_id: accountId,
        fix: false,
      });

      // Without subscription, all upgrades are excess
      expect(excess[projectId]).toBeDefined();
      expect(excess[projectId].cores).toBe(2);
      expect(excess[projectId].memory).toBe(4000);
    });

    it("does not fix when fix=false", async () => {
      const accountId = uuid();
      const email = `no-fix-${Date.now()}@example.com`;
      const projectId = uuid();

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2 },
            },
          },
        ],
      );

      await ensure_user_project_upgrades_are_valid_wrapper({
        account_id: accountId,
        fix: false,
      });

      // Verify upgrades not changed
      const result = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId],
      );
      expect(result.rows[0].users[accountId].upgrades.cores).toBe(2);
    });

    it("fixes excess upgrades when fix=true (default)", async () => {
      const accountId = uuid();
      const email = `fix-${Date.now()}@example.com`;
      const projectId = uuid();

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2, memory: 4000 },
            },
          },
        ],
      );

      await ensure_user_project_upgrades_are_valid_wrapper({
        account_id: accountId,
        fix: true,
      });

      // Verify upgrades were reduced
      const result = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId],
      );
      expect(
        result.rows[0].users[accountId].upgrades.cores,
      ).toBeLessThanOrEqual(0);
      expect(
        result.rows[0].users[accountId].upgrades.memory,
      ).toBeLessThanOrEqual(0);
    });

    it("handles multiple projects with excess", async () => {
      const accountId = uuid();
      const email = `multiple-${Date.now()}@example.com`;
      const projectId1 = uuid();
      const projectId2 = uuid();

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId1,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 3 },
            },
          },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId2,
          {
            [accountId]: {
              group: "owner",
              upgrades: { memory: 8000 },
            },
          },
        ],
      );

      const excess = await ensure_user_project_upgrades_are_valid_wrapper({
        account_id: accountId,
        fix: false,
      });

      expect(Object.keys(excess).length).toBeGreaterThanOrEqual(1);
    });

    it("handles account with null stripe_customer", async () => {
      const accountId = uuid();
      const email = `null-stripe-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, stripe_customer) VALUES ($1, $2, $3)",
        [accountId, email, null],
      );

      const excess = await ensure_user_project_upgrades_are_valid_wrapper({
        account_id: accountId,
        fix: false,
      });

      expect(excess).toEqual({});
    });
  });

  describe("get_project_upgrades", () => {
    it("returns undefined when project has no users", async () => {
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      expect(upgrades).toBeUndefined();
    });

    it("returns undefined when project users is null", async () => {
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [projectId, null],
      );

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      expect(upgrades).toBeUndefined();
    });

    it("returns empty object when no users have upgrades", async () => {
      const projectId = uuid();
      const accountId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [projectId, { [accountId]: { group: "owner" } }],
      );

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      // CoffeeScript returns {} instead of undefined when no upgrades
      expect(upgrades).toEqual({});
    });

    it("returns single user's upgrades", async () => {
      const projectId = uuid();
      const accountId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2, memory: 4000 },
            },
          },
        ],
      );

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      expect(upgrades).toEqual({ cores: 2, memory: 4000 });
    });

    it("sums upgrades from multiple users", async () => {
      const projectId = uuid();
      const accountId1 = uuid();
      const accountId2 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId1]: {
              group: "owner",
              upgrades: { cores: 2, memory: 4000 },
            },
            [accountId2]: {
              group: "collaborator",
              upgrades: { cores: 1, disk: 1000 },
            },
          },
        ],
      );

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      expect(upgrades.cores).toBe(3);
      expect(upgrades.memory).toBe(4000);
      expect(upgrades.disk).toBe(1000);
    });

    it("sums upgrades from three users", async () => {
      const projectId = uuid();
      const accountId1 = uuid();
      const accountId2 = uuid();
      const accountId3 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId1]: {
              group: "owner",
              upgrades: { cores: 1, memory: 2000 },
            },
            [accountId2]: {
              group: "collaborator",
              upgrades: { cores: 2, memory: 2000, disk: 500 },
            },
            [accountId3]: {
              group: "collaborator",
              upgrades: { disk: 500, network: 1 },
            },
          },
        ],
      );

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      expect(upgrades.cores).toBe(3);
      expect(upgrades.memory).toBe(4000);
      expect(upgrades.disk).toBe(1000);
      expect(upgrades.network).toBe(1);
    });

    it("handles users with null upgrades", async () => {
      const projectId = uuid();
      const accountId1 = uuid();
      const accountId2 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId1]: {
              group: "owner",
              upgrades: { cores: 2 },
            },
            [accountId2]: {
              group: "collaborator",
              upgrades: null,
            },
          },
        ],
      );

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      expect(upgrades).toEqual({ cores: 2 });
    });

    it("handles users with undefined upgrades", async () => {
      const projectId = uuid();
      const accountId1 = uuid();
      const accountId2 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId1]: {
              group: "owner",
              upgrades: { cores: 1 },
            },
            [accountId2]: {
              group: "collaborator",
            },
          },
        ],
      );

      const upgrades = await get_project_upgrades_wrapper({
        project_id: projectId,
      });

      expect(upgrades).toEqual({ cores: 1 });
    });
  });

  describe("remove_all_user_project_upgrades", () => {
    it("throws error for invalid account_id", async () => {
      await expect(
        remove_all_user_project_upgrades_wrapper({
          account_id: "not-a-uuid",
        }),
      ).rejects.toThrow(/invalid account_id/);
    });

    it("removes upgrades from single project", async () => {
      const accountId = uuid();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2 },
            },
          },
        ],
      );

      await remove_all_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      const result = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId],
      );
      expect(result.rows[0].users[accountId].upgrades).toBeUndefined();
    });

    it("removes upgrades from all user's projects", async () => {
      const accountId = uuid();
      const projectId1 = uuid();
      const projectId2 = uuid();
      const projectId3 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId1,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2 },
            },
          },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId2,
          {
            [accountId]: {
              group: "owner",
              upgrades: { memory: 4000 },
            },
          },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId3,
          {
            [accountId]: {
              group: "collaborator",
              upgrades: { disk: 1000 },
            },
          },
        ],
      );

      await remove_all_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      const result1 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId1],
      );
      const result2 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId2],
      );
      const result3 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId3],
      );

      expect(result1.rows[0].users[accountId].upgrades).toBeUndefined();
      expect(result2.rows[0].users[accountId].upgrades).toBeUndefined();
      expect(result3.rows[0].users[accountId].upgrades).toBeUndefined();
    });

    it("only removes upgrades from specified projects", async () => {
      const accountId = uuid();
      const projectId1 = uuid();
      const projectId2 = uuid();
      const projectId3 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId1,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2 },
            },
          },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId2,
          {
            [accountId]: {
              group: "owner",
              upgrades: { memory: 4000 },
            },
          },
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId3,
          {
            [accountId]: {
              group: "owner",
              upgrades: { disk: 1000 },
            },
          },
        ],
      );

      // Remove upgrades only from project1 and project2
      await remove_all_user_project_upgrades_wrapper({
        account_id: accountId,
        projects: [projectId1, projectId2],
      });

      const result1 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId1],
      );
      const result2 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId2],
      );
      const result3 = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId3],
      );

      expect(result1.rows[0].users[accountId].upgrades).toBeUndefined();
      expect(result2.rows[0].users[accountId].upgrades).toBeUndefined();
      expect(result3.rows[0].users[accountId].upgrades).toEqual({ disk: 1000 });
    });

    it("throws error when projects is not an array", async () => {
      const accountId = uuid();

      await expect(
        remove_all_user_project_upgrades_wrapper({
          account_id: accountId,
          projects: "not-an-array" as any,
        }),
      ).rejects.toThrow(/projects must be an array/);
    });

    it("throws error when project id in array is invalid", async () => {
      const accountId = uuid();

      await expect(
        remove_all_user_project_upgrades_wrapper({
          account_id: accountId,
          projects: ["not-a-uuid"],
        }),
      ).rejects.toThrow(/each entry in projects must be a valid uuid/);
    });

    it("throws error when one of many project ids is invalid", async () => {
      const accountId = uuid();
      const validId = uuid();

      await expect(
        remove_all_user_project_upgrades_wrapper({
          account_id: accountId,
          projects: [validId, "not-a-uuid"],
        }),
      ).rejects.toThrow(/each entry in projects must be a valid uuid/);
    });

    it("preserves other user data when removing upgrades", async () => {
      const accountId = uuid();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId]: {
              group: "owner",
              upgrades: { cores: 2 },
              other_field: "preserved",
              hidden: true,
            },
          },
        ],
      );

      await remove_all_user_project_upgrades_wrapper({
        account_id: accountId,
      });

      const result = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(result.rows[0].users[accountId].upgrades).toBeUndefined();
      expect(result.rows[0].users[accountId].other_field).toBe("preserved");
      expect(result.rows[0].users[accountId].group).toBe("owner");
      expect(result.rows[0].users[accountId].hidden).toBe(true);
    });

    it("does not affect other users' upgrades", async () => {
      const accountId1 = uuid();
      const accountId2 = uuid();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [
          projectId,
          {
            [accountId1]: {
              group: "owner",
              upgrades: { cores: 2 },
            },
            [accountId2]: {
              group: "collaborator",
              upgrades: { memory: 4000 },
            },
          },
        ],
      );

      await remove_all_user_project_upgrades_wrapper({
        account_id: accountId1,
      });

      const result = await pool.query(
        "SELECT users FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(result.rows[0].users[accountId1].upgrades).toBeUndefined();
      expect(result.rows[0].users[accountId2].upgrades).toEqual({
        memory: 4000,
      });
    });

    it("handles empty projects array", async () => {
      const accountId = uuid();

      // CoffeeScript generates invalid SQL "in ()" for empty array, causing syntax error
      // This is a known limitation of the old implementation
      await expect(
        remove_all_user_project_upgrades_wrapper({
          account_id: accountId,
          projects: [],
        }),
      ).rejects.toMatch(/syntax error/);
    });

    it("succeeds when user has no upgrades to remove", async () => {
      const accountId = uuid();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, users) VALUES ($1, $2)",
        [projectId, { [accountId]: { group: "owner" } }],
      );

      // Should not throw
      await remove_all_user_project_upgrades_wrapper({
        account_id: accountId,
      });
    });

    it("succeeds when user has no projects", async () => {
      const accountId = uuid();

      // Should not throw
      await remove_all_user_project_upgrades_wrapper({
        account_id: accountId,
      });
    });
  });

  describe("ensure_all_user_project_upgrades_are_valid", () => {
    it("processes all accounts with Stripe", async () => {
      const accountId1 = uuid();
      const accountId2 = uuid();
      const email1 = `stripe1-${Date.now()}@example.com`;
      const email2 = `stripe2-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, stripe_customer_id) VALUES ($1, $2, $3)",
        [accountId1, email1, `cus_${Date.now()}`],
      );

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, stripe_customer_id) VALUES ($1, $2, $3)",
        [accountId2, email2, `cus_${Date.now()}`],
      );

      // Should not throw
      await ensure_all_user_project_upgrades_are_valid_wrapper({
        limit: 2,
      });
    });

    it("skips accounts without Stripe", async () => {
      const accountId = uuid();
      const email = `no-stripe-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Should process successfully without errors
      await ensure_all_user_project_upgrades_are_valid_wrapper({
        limit: 1,
      });
    });

    it("respects limit parameter", async () => {
      const accountId1 = uuid();
      const accountId2 = uuid();
      const email1 = `limit1-${Date.now()}@example.com`;
      const email2 = `limit2-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, stripe_customer_id) VALUES ($1, $2, $3)",
        [accountId1, email1, `cus_${Date.now()}`],
      );

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, stripe_customer_id) VALUES ($1, $2, $3)",
        [accountId2, email2, `cus_${Date.now()}`],
      );

      // Should not throw with limit=1 (processes accounts one at a time)
      await ensure_all_user_project_upgrades_are_valid_wrapper({
        limit: 1,
      });
    });

    it("handles no Stripe accounts", async () => {
      // Should succeed with no Stripe accounts
      await ensure_all_user_project_upgrades_are_valid_wrapper({
        limit: 1,
      });
    });
  });
});
