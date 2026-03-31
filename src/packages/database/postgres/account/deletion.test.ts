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

describe("Account deletion methods", () => {
  const database: PostgreSQL = db();
  let pool: any;

  // Wrapper functions
  async function delete_account_wrapper(opts: {
    account_id: string;
  }): Promise<void> {
    return callback_opts(database.delete_account.bind(database))(opts);
  }

  async function mark_account_deleted_wrapper(opts: {
    account_id?: string;
    email_address?: string;
  }): Promise<void> {
    return callback_opts(database.mark_account_deleted.bind(database))(opts);
  }

  beforeAll(async () => {
    pool = getPool();
    await initEphemeralDatabase();
  });

  afterAll(async () => {
    await testCleanup();
  });

  describe("delete_account", () => {
    it("completely deletes an account from the database", async () => {
      const accountId = uuid();
      const email = `delete-${Date.now()}@example.com`;

      // Create account
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Verify account exists
      let result = await pool.query(
        "SELECT * FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows.length).toBe(1);

      // Delete the account
      await delete_account_wrapper({ account_id: accountId });

      // Verify account is gone
      result = await pool.query(
        "SELECT * FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows.length).toBe(0);
    });

    it("handles deletion of account with additional data", async () => {
      const accountId = uuid();
      const email = `complex-delete-${Date.now()}@example.com`;

      // Create account with more fields
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name, last_name) VALUES ($1, $2, $3, $4)",
        [accountId, email, "Test", "User"],
      );

      await delete_account_wrapper({ account_id: accountId });

      const result = await pool.query(
        "SELECT * FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(result.rows.length).toBe(0);
    });

    it("succeeds silently if account doesn't exist", async () => {
      const nonexistentId = uuid();

      // Should not throw
      await delete_account_wrapper({ account_id: nonexistentId });
    });
  });

  describe("mark_account_deleted", () => {
    it("marks account as deleted using account_id", async () => {
      const accountId = uuid();
      const email = `mark-deleted-${Date.now()}@example.com`;

      // Create account
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name) VALUES ($1, $2, $3)",
        [accountId, email, "Test"],
      );

      // Mark as deleted
      await mark_account_deleted_wrapper({ account_id: accountId });

      // Verify the account was marked deleted
      const result = await pool.query(
        "SELECT deleted, email_address, email_address_before_delete, passports FROM accounts WHERE account_id = $1",
        [accountId],
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].deleted).toBe(true);
      expect(result.rows[0].email_address).toBeNull();
      expect(result.rows[0].email_address_before_delete).toBe(email);
      expect(result.rows[0].passports).toBeNull();
    });

    it("marks account as deleted using email_address", async () => {
      const accountId = uuid();
      const email = `mark-by-email-${Date.now()}@example.com`;

      // Create account
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Mark as deleted using email
      await mark_account_deleted_wrapper({ email_address: email });

      // Verify the account was marked deleted
      const result = await pool.query(
        "SELECT deleted, email_address, email_address_before_delete FROM accounts WHERE account_id = $1",
        [accountId],
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].deleted).toBe(true);
      expect(result.rows[0].email_address).toBeNull();
      expect(result.rows[0].email_address_before_delete).toBe(email);
    });

    it("preserves account record in database", async () => {
      const accountId = uuid();
      const email = `preserve-${Date.now()}@example.com`;
      const firstName = "Preserved";
      const lastName = "User";

      // Create account with data
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, first_name, last_name) VALUES ($1, $2, $3, $4)",
        [accountId, email, firstName, lastName],
      );

      await mark_account_deleted_wrapper({ account_id: accountId });

      // Account should still exist with other data intact
      const result = await pool.query(
        "SELECT account_id, first_name, last_name, deleted FROM accounts WHERE account_id = $1",
        [accountId],
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].account_id).toBe(accountId);
      expect(result.rows[0].first_name).toBe(firstName);
      expect(result.rows[0].last_name).toBe(lastName);
      expect(result.rows[0].deleted).toBe(true);
    });

    it("clears passports field", async () => {
      const accountId = uuid();
      const email = `passports-${Date.now()}@example.com`;
      const passports = {
        "google-oauth2": { id: "12345", emails: [email] },
      };

      // Create account with passports
      await pool.query(
        "INSERT INTO accounts (account_id, email_address, passports) VALUES ($1, $2, $3)",
        [accountId, email, JSON.stringify(passports)],
      );

      await mark_account_deleted_wrapper({ account_id: accountId });

      const result = await pool.query(
        "SELECT passports FROM accounts WHERE account_id = $1",
        [accountId],
      );

      expect(result.rows[0].passports).toBeNull();
    });

    it("throws error if neither account_id nor email_address provided", async () => {
      await expect(mark_account_deleted_wrapper({})).rejects.toMatch(
        /one of email address or account_id must be specified/,
      );
    });

    it("throws error for nonexistent email address", async () => {
      const email = `nonexistent-${Date.now()}@example.com`;

      await expect(
        mark_account_deleted_wrapper({ email_address: email }),
      ).rejects.toMatch(/no such email address/);
    });

    it("can be called multiple times safely", async () => {
      const accountId = uuid();
      const email = `multiple-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      // Mark as deleted twice
      await mark_account_deleted_wrapper({ account_id: accountId });
      await mark_account_deleted_wrapper({ account_id: accountId });

      const result = await pool.query(
        "SELECT deleted, email_address FROM accounts WHERE account_id = $1",
        [accountId],
      );

      expect(result.rows[0].deleted).toBe(true);
      expect(result.rows[0].email_address).toBeNull();
    });
  });

  describe("Integration: delete vs mark_deleted", () => {
    it("delete_account removes record completely while mark_account_deleted preserves it", async () => {
      const accountId1 = uuid();
      const accountId2 = uuid();
      const email1 = `complete-delete-${Date.now()}@example.com`;
      const email2 = `mark-delete-${Date.now()}@example.com`;

      // Create two accounts
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId1, email1],
      );
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId2, email2],
      );

      // Completely delete first account
      await delete_account_wrapper({ account_id: accountId1 });

      // Mark second account as deleted
      await mark_account_deleted_wrapper({ account_id: accountId2 });

      // Check first account is gone
      const result1 = await pool.query(
        "SELECT * FROM accounts WHERE account_id = $1",
        [accountId1],
      );
      expect(result1.rows.length).toBe(0);

      // Check second account still exists but is marked deleted
      const result2 = await pool.query(
        "SELECT * FROM accounts WHERE account_id = $1",
        [accountId2],
      );
      expect(result2.rows.length).toBe(1);
      expect(result2.rows[0].deleted).toBe(true);
    });
  });
});
