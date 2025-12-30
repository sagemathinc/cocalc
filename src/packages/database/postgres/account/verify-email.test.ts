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

describe("Email verification methods", () => {
  const database: PostgreSQL = db();
  let pool: any;

  // Wrapper functions
  async function verify_email_create_token_wrapper(opts: {
    account_id: string;
  }): Promise<{ email_address: string; token: string; old_challenge?: any }> {
    return callback_opts(database.verify_email_create_token.bind(database))(
      opts,
    );
  }

  async function verify_email_check_token_wrapper(opts: {
    email_address: string;
    token: string;
  }): Promise<void> {
    return callback_opts(database.verify_email_check_token.bind(database))(
      opts,
    );
  }

  async function verify_email_get_wrapper(opts: {
    account_id: string;
  }): Promise<any> {
    return callback_opts(database.verify_email_get.bind(database))(opts);
  }

  async function is_verified_email_wrapper(opts: {
    email_address: string;
  }): Promise<boolean> {
    return callback_opts(database.is_verified_email.bind(database))(opts);
  }

  beforeAll(async () => {
    pool = getPool();
    await initEphemeralDatabase();
  });

  afterAll(async () => {
    await testCleanup();
  });

  describe("verify_email_get", () => {
    it("returns email address and verification status for an account", async () => {
      const accountId = uuid();
      const email = `test-${Date.now()}@example.com`;

      // Create account
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      const result = await verify_email_get_wrapper({ account_id: accountId });
      expect(result).toBeDefined();
      expect(result.email_address).toBe(email);
      expect(result.email_address_verified).toBeNull();
    });

    it("shows verified status when email is verified", async () => {
      const accountId = uuid();
      const email = `verified-${Date.now()}@example.com`;
      const verifiedAt = new Date();

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, email_address_verified) VALUES ($1, $2, $3)",
        [accountId, email, JSON.stringify({ [email]: verifiedAt })],
      );

      const result = await verify_email_get_wrapper({ account_id: accountId });
      expect(result.email_address).toBe(email);
      expect(result.email_address_verified).toBeDefined();
      expect(result.email_address_verified[email]).toBeDefined();
    });

    it("handles accounts with no email address", async () => {
      const accountId = uuid();
      await pool.query("INSERT INTO accounts (account_id) VALUES ($1)", [
        accountId,
      ]);

      const result = await verify_email_get_wrapper({ account_id: accountId });
      expect(result.email_address).toBeNull();
    });
  });

  describe("is_verified_email", () => {
    it("returns false for unverified email", async () => {
      const accountId = uuid();
      const email = `unverified-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      const verified = await is_verified_email_wrapper({
        email_address: email,
      });
      expect(verified).toBe(false);
    });

    it("returns true for verified email", async () => {
      const accountId = uuid();
      const email = `verified-${Date.now()}@example.com`;
      const verifiedAt = new Date();

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, email_address_verified) VALUES ($1, $2, $3)",
        [accountId, email, JSON.stringify({ [email]: verifiedAt })],
      );

      const verified = await is_verified_email_wrapper({
        email_address: email,
      });
      expect(verified).toBe(true);
    });

    it("throws error for non-existent email", async () => {
      const email = `nonexistent-${Date.now()}@example.com`;
      await expect(
        is_verified_email_wrapper({ email_address: email }),
      ).rejects.toMatch(/no such email address/);
    });
  });

  describe("verify_email_create_token", () => {
    it("creates a verification token for an account", async () => {
      const accountId = uuid();
      const email = `create-token-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      const result = await verify_email_create_token_wrapper({
        account_id: accountId,
      });

      expect(result).toBeDefined();
      expect(result.email_address).toBe(email);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);

      // Verify the challenge was stored in the database
      const { rows } = await pool.query(
        "SELECT email_address_challenge FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(rows[0].email_address_challenge).toBeDefined();
      expect(rows[0].email_address_challenge.email).toBe(email);
      expect(rows[0].email_address_challenge.token).toBe(result.token);
      expect(rows[0].email_address_challenge.time).toBeDefined();
    });

    it("replaces old challenge when creating new token", async () => {
      const accountId = uuid();
      const email = `replace-token-${Date.now()}@example.com`;
      const oldToken = "old-token-12345";
      const oldChallenge = {
        email,
        token: oldToken,
        time: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      };

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, email_address_challenge) VALUES ($1, $2, $3)",
        [accountId, email, JSON.stringify(oldChallenge)],
      );

      const result = await verify_email_create_token_wrapper({
        account_id: accountId,
      });

      expect(result.email_address).toBe(email);
      expect(result.token).toBeDefined();
      expect(result.token).not.toBe(oldToken);
      expect(result.old_challenge).toBeDefined();
      expect(result.old_challenge.token).toBe(oldToken);

      // Verify new challenge was stored
      const { rows } = await pool.query(
        "SELECT email_address_challenge FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(rows[0].email_address_challenge.token).toBe(result.token);
      expect(rows[0].email_address_challenge.token).not.toBe(oldToken);
    });
  });

  describe("verify_email_check_token", () => {
    it("verifies email with valid token", async () => {
      const accountId = uuid();
      const email = `check-token-${Date.now()}@example.com`;

      // Create account and token
      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      const { token } = await verify_email_create_token_wrapper({
        account_id: accountId,
      });

      // Verify the token
      await verify_email_check_token_wrapper({ email_address: email, token });

      // Check that email is now verified
      const { rows } = await pool.query(
        "SELECT email_address_verified, email_address_challenge FROM accounts WHERE account_id = $1",
        [accountId],
      );

      expect(rows[0].email_address_verified).toBeDefined();
      expect(rows[0].email_address_verified[email]).toBeDefined();
      // Challenge should be deleted after successful verification
      expect(rows[0].email_address_challenge).toBeNull();
    });

    it("rejects invalid token", async () => {
      const accountId = uuid();
      const email = `invalid-token-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      await verify_email_create_token_wrapper({ account_id: accountId });

      await expect(
        verify_email_check_token_wrapper({
          email_address: email,
          token: "wrong-token",
        }),
      ).rejects.toMatch(/token is not correct/i);
    });

    it("rejects token for wrong email", async () => {
      const accountId = uuid();
      const email = `wrong-email-${Date.now()}@example.com`;
      const otherEmail = `other-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      const { token } = await verify_email_create_token_wrapper({
        account_id: accountId,
      });

      // Try to verify with different email
      await expect(
        verify_email_check_token_wrapper({
          email_address: otherEmail,
          token,
        }),
      ).rejects.toMatch(/no such email address/);
    });

    it("rejects expired token (older than 24 hours)", async () => {
      const accountId = uuid();
      const email = `expired-token-${Date.now()}@example.com`;
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const challenge = {
        email,
        token: "test-token-12345",
        time: oldTime,
      };

      await pool.query(
        "INSERT INTO accounts (account_id, email_address, email_address_challenge) VALUES ($1, $2, $3)",
        [accountId, email, JSON.stringify(challenge)],
      );

      await expect(
        verify_email_check_token_wrapper({
          email_address: email,
          token: "test-token-12345",
        }),
      ).rejects.toMatch(/no longer valid/i);
    });

    it("accepts token within 24 hour window", async () => {
      const accountId = uuid();
      const email = `recent-token-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      const { token } = await verify_email_create_token_wrapper({
        account_id: accountId,
      });

      // Should not throw
      await verify_email_check_token_wrapper({ email_address: email, token });

      const verified = await is_verified_email_wrapper({
        email_address: email,
      });
      expect(verified).toBe(true);
    });

    it("rejects account with no challenge setup", async () => {
      const accountId = uuid();
      const email = `no-challenge-${Date.now()}@example.com`;

      await pool.query(
        "INSERT INTO accounts (account_id, email_address) VALUES ($1, $2)",
        [accountId, email],
      );

      await expect(
        verify_email_check_token_wrapper({
          email_address: email,
          token: "any-token",
        }),
      ).rejects.toMatch(/no account verification is setup/i);
    });
  });
});
