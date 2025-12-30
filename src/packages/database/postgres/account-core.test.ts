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

describe("account queries", () => {
  const database: PostgreSQL = db();

  // Wrapper functions that use the CoffeeScript class
  async function get_account_wrapper(opts: {
    account_id?: string;
    email_address?: string;
    lti_id?: string[];
    columns?: string[];
  }): Promise<any> {
    return callback_opts(database.get_account.bind(database))(opts);
  }

  async function is_banned_user_wrapper(opts: {
    account_id?: string;
    email_address?: string;
  }): Promise<boolean> {
    return callback_opts(database.is_banned_user.bind(database))(opts);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  describe("get_account", () => {
    it("fetches account by account_id with default columns", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `user-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name, last_name, created) VALUES ($1, $2, $3, $4, NOW())",
        [accountId, email, "John", "Doe"],
      );

      const result = await get_account_wrapper({ account_id: accountId });

      expect(result.account_id).toBe(accountId);
      expect(result.email_address).toBe(email);
      expect(result.first_name).toBe("John");
      expect(result.last_name).toBe("Doe");
    });

    it("fetches account by email_address", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `email-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name, last_name, created) VALUES ($1, $2, $3, $4, NOW())",
        [accountId, email, "Jane", "Smith"],
      );

      const result = await get_account_wrapper({ email_address: email });

      expect(result.account_id).toBe(accountId);
      expect(result.email_address).toBe(email);
      expect(result.first_name).toBe("Jane");
      expect(result.last_name).toBe("Smith");
    });

    it("fetches specific columns only", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `columns-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name, last_name, created) VALUES ($1, $2, $3, $4, NOW())",
        [accountId, email, "Bob", "Johnson"],
      );

      const result = await get_account_wrapper({
        account_id: accountId,
        columns: ["account_id", "email_address"],
      });

      expect(result.account_id).toBe(accountId);
      expect(result.email_address).toBe(email);
      expect(result.first_name).toBeUndefined();
      expect(result.last_name).toBeUndefined();
    });

    it("handles password_is_set virtual column when password exists", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `password-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, password_hash, created) VALUES ($1, $2, $3, NOW())",
        [accountId, email, "hashed_password_123"],
      );

      const result = await get_account_wrapper({
        account_id: accountId,
        columns: ["account_id", "password_is_set"],
      });

      expect(result.account_id).toBe(accountId);
      expect(result.password_is_set).toBe(true);
      expect(result.password_hash).toBeUndefined();
    });

    it("handles password_is_set virtual column when password is null", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `nopassword-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
        [accountId, email],
      );

      const result = await get_account_wrapper({
        account_id: accountId,
        columns: ["account_id", "password_is_set"],
      });

      expect(result.account_id).toBe(accountId);
      expect(result.password_is_set).toBe(false);
      expect(result.password_hash).toBeUndefined();
    });

    it("includes password_hash when explicitly requested with password_is_set", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `hash-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, password_hash, created) VALUES ($1, $2, $3, NOW())",
        [accountId, email, "hashed_password_456"],
      );

      const result = await get_account_wrapper({
        account_id: accountId,
        columns: ["account_id", "password_hash", "password_is_set"],
      });

      expect(result.account_id).toBe(accountId);
      expect(result.password_hash).toBe("hashed_password_456");
      expect(result.password_is_set).toBe(true);
    });

    it("throws error when account does not exist", async () => {
      const fakeAccountId = uuid();

      try {
        const result = await get_account_wrapper({ account_id: fakeAccountId });
        // If we get here, the call didn't throw - let's see what we got
        console.log("Unexpected result:", result);
        fail("Expected error to be thrown");
      } catch (err) {
        expect(err).toBe("no such account");
      }
    });

    it("fetches account with groups and other settings", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `groups-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, groups, other_settings, created) VALUES ($1, $2, $3, $4, NOW())",
        [
          accountId,
          email,
          ["admin", "partner"],
          { theme: "dark", locale: "en" },
        ],
      );

      const result = await get_account_wrapper({
        account_id: accountId,
        columns: ["account_id", "groups", "other_settings"],
      });

      expect(result.account_id).toBe(accountId);
      expect(result.groups).toEqual(["admin", "partner"]);
      expect(result.other_settings).toEqual({ theme: "dark", locale: "en" });
    });

    it("prefers account_id over email_address when both provided", async () => {
      const pool = getPool();
      const accountId1 = uuid();
      const accountId2 = uuid();
      const email1 = `pref1-${accountId1}@test.com`;
      const email2 = `pref2-${accountId2}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name, created) VALUES ($1, $2, $3, NOW())",
        [accountId1, email1, "First"],
      );
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name, created) VALUES ($1, $2, $3, NOW())",
        [accountId2, email2, "Second"],
      );

      const result = await get_account_wrapper({
        account_id: accountId1,
        email_address: email2, // Should be ignored
        columns: ["account_id", "first_name"],
      });

      expect(result.account_id).toBe(accountId1);
      expect(result.first_name).toBe("First");
    });

    it("fetches account by lti_id", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `lti-${accountId}@test.com`;
      const ltiId = [`lti_system_${uuid()}`, `user_${uuid()}`];

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, lti_id, created) VALUES ($1, $2, $3, NOW())",
        [accountId, email, ltiId],
      );

      const result = await get_account_wrapper({
        lti_id: ltiId,
        columns: ["account_id", "lti_id"],
      });

      expect(result.account_id).toBe(accountId);
      expect(result.lti_id).toEqual(ltiId);
    });
  });

  describe("is_banned_user", () => {
    it("returns false when user is not banned", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `notbanned-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, created) VALUES ($1, $2, NOW())",
        [accountId, email],
      );

      const isBanned = await is_banned_user_wrapper({ account_id: accountId });

      expect(isBanned).toBe(false);
    });

    it("returns true when user is banned", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `banned-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, banned, created) VALUES ($1, $2, $3, NOW())",
        [accountId, email, true],
      );

      const isBanned = await is_banned_user_wrapper({ account_id: accountId });

      expect(isBanned).toBe(true);
    });

    it("checks ban status by email_address", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `bannedemail-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, banned, created) VALUES ($1, $2, $3, NOW())",
        [accountId, email, true],
      );

      const isBanned = await is_banned_user_wrapper({ email_address: email });

      expect(isBanned).toBe(true);
    });

    it("returns false when banned field is explicitly false", async () => {
      const pool = getPool();
      const accountId = uuid();
      const email = `notbanned2-${accountId}@test.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, banned, created) VALUES ($1, $2, $3, NOW())",
        [accountId, email, false],
      );

      const isBanned = await is_banned_user_wrapper({ account_id: accountId });

      expect(isBanned).toBe(false);
    });
  });
});
