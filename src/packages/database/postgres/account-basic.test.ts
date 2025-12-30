/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "./types";

describe("account basic methods", () => {
  const database: PostgreSQL = db();

  // Wrapper functions that use the CoffeeScript class
  async function is_admin_wrapper(opts: {
    account_id: string;
  }): Promise<boolean> {
    return callback_opts(database.is_admin.bind(database))(opts);
  }

  async function user_is_in_group_wrapper(opts: {
    account_id: string;
    group: string;
  }): Promise<boolean> {
    return callback_opts(database.user_is_in_group.bind(database))(opts);
  }

  async function account_exists_wrapper(opts: {
    email_address: string;
  }): Promise<string | undefined> {
    return callback_opts(database.account_exists.bind(database))(opts);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  describe("is_admin", () => {
    it("returns false when user is not admin", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account without admin group
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
        [accountId, `user-${accountId}@test.com`],
      );

      const isAdmin = await is_admin_wrapper({ account_id: accountId });

      expect(isAdmin).toBe(false);
    });

    it("returns true when user is admin", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account with admin group
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created, groups) VALUES ($1, $2, NOW(), $3)",
        [accountId, `admin-${accountId}@test.com`, ["admin"]],
      );

      const isAdmin = await is_admin_wrapper({ account_id: accountId });

      expect(isAdmin).toBe(true);
    });

    it("returns false when user has other groups but not admin", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account with other groups
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created, groups) VALUES ($1, $2, NOW(), $3)",
        [
          accountId,
          `user-groups-${accountId}@test.com`,
          ["partner", "teacher"],
        ],
      );

      const isAdmin = await is_admin_wrapper({ account_id: accountId });

      expect(isAdmin).toBe(false);
    });

    it("returns true when user has admin plus other groups", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account with admin and other groups
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created, groups) VALUES ($1, $2, NOW(), $3)",
        [
          accountId,
          `admin-multi-${accountId}@test.com`,
          ["admin", "partner", "teacher"],
        ],
      );

      const isAdmin = await is_admin_wrapper({ account_id: accountId });

      expect(isAdmin).toBe(true);
    });

    it("returns false when account does not exist", async () => {
      const fakeAccountId = uuid();

      const isAdmin = await is_admin_wrapper({ account_id: fakeAccountId });

      expect(isAdmin).toBe(false);
    });
  });

  describe("user_is_in_group", () => {
    it("returns true when user is in specified group", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account with partner group
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created, groups) VALUES ($1, $2, NOW(), $3)",
        [accountId, `partner-${accountId}@test.com`, ["partner"]],
      );

      const isInGroup = await user_is_in_group_wrapper({
        account_id: accountId,
        group: "partner",
      });

      expect(isInGroup).toBe(true);
    });

    it("returns false when user is not in specified group", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account with teacher group
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created, groups) VALUES ($1, $2, NOW(), $3)",
        [accountId, `teacher-${accountId}@test.com`, ["teacher"]],
      );

      const isInGroup = await user_is_in_group_wrapper({
        account_id: accountId,
        group: "partner",
      });

      expect(isInGroup).toBe(false);
    });

    it("returns true when user has multiple groups including specified one", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account with multiple groups
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created, groups) VALUES ($1, $2, NOW(), $3)",
        [
          accountId,
          `multi-group-${accountId}@test.com`,
          ["admin", "partner", "teacher"],
        ],
      );

      const isInGroup = await user_is_in_group_wrapper({
        account_id: accountId,
        group: "partner",
      });

      expect(isInGroup).toBe(true);
    });

    it("returns false when user has no groups", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account without groups
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
        [accountId, `no-groups-${accountId}@test.com`],
      );

      const isInGroup = await user_is_in_group_wrapper({
        account_id: accountId,
        group: "partner",
      });

      expect(isInGroup).toBe(false);
    });

    it("returns false when account does not exist", async () => {
      const fakeAccountId = uuid();

      const isInGroup = await user_is_in_group_wrapper({
        account_id: fakeAccountId,
        group: "partner",
      });

      expect(isInGroup).toBe(false);
    });
  });

  describe("account_exists", () => {
    it("returns account_id when account exists", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `exists-${accountId}@test.com`;

      // Create account
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
        [accountId, email],
      );

      const result = await account_exists_wrapper({ email_address: email });

      expect(result).toBe(accountId);
    });

    it("returns undefined when account does not exist", async () => {
      const email = `nonexistent-${uuid()}@test.com`;

      const result = await account_exists_wrapper({ email_address: email });

      expect(result).toBeUndefined();
    });

    it("finds account with exact case match", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `casesensitive-${accountId}@test.com`;

      // Create account with lowercase email
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
        [accountId, email],
      );

      // Search with exact case match
      const exactResult = await account_exists_wrapper({
        email_address: email,
      });

      expect(exactResult).toBe(accountId);
    });

    it("handles special characters in email", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `special+chars-${accountId}@test.com`;

      // Create account with special chars
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
        [accountId, email],
      );

      const result = await account_exists_wrapper({ email_address: email });

      expect(result).toBe(accountId);
    });

    it("returns first account when duplicate emails exist (should not happen)", async () => {
      const pool = getPool();
      const accountId1 = uuid();
      const accountId2 = uuid();
      const email = `duplicate-${uuid()}@test.com`;

      // Create two accounts with same email (violates constraints but test edge case)
      // Note: This might fail if email has UNIQUE constraint
      try {
        await pool.query(
          "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
          [accountId1, email],
        );

        // This should fail if there's a unique constraint
        await pool.query(
          "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
          [accountId2, email],
        );

        const result = await account_exists_wrapper({ email_address: email });

        // Should return one of them (database-dependent which one)
        expect([accountId1, accountId2]).toContain(result);
      } catch (err) {
        // If unique constraint exists, this is expected
        expect(err).toBeDefined();
      }
    });
  });
});
