/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";

import passwordHash from "@cocalc/backend/auth/password-hash";
import type { PostgreSQL } from "./types";

describe("password methods", () => {
  const database: PostgreSQL = db();

  const changePassword = callback_opts(
    database.change_password.bind(database),
  ) as (opts: {
    account_id: string;
    password_hash: string;
    invalidate_remember_me?: boolean;
  }) => Promise<void>;
  const resetPassword = callback_opts(
    database.reset_password.bind(database),
  ) as (opts: {
    email_address?: string;
    account_id?: string;
    password?: string;
    random?: boolean;
  }) => Promise<void>;
  const setPasswordReset = callback_opts(
    database.set_password_reset.bind(database),
  ) as (opts: { email_address: string; ttl: number }) => Promise<string>;
  const getPasswordReset = callback_opts(
    database.get_password_reset.bind(database),
  ) as (opts: { id: string }) => Promise<string | undefined>;
  const deletePasswordReset = callback_opts(
    database.delete_password_reset.bind(database),
  ) as (opts: { id: string }) => Promise<void>;
  const recordPasswordResetAttempt = callback_opts(
    database.record_password_reset_attempt.bind(database),
  ) as (opts: {
    email_address: string;
    ip_address: string;
    ttl: number;
  }) => Promise<void>;
  const countPasswordResetAttempts = callback_opts(
    database.count_password_reset_attempts.bind(database),
  ) as (opts: {
    email_address?: string;
    ip_address?: string;
    age_s: number;
  }) => Promise<number>;

  async function insertAccount(opts: {
    account_id: string;
    email_address: string;
    password_hash?: string;
  }): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO accounts (account_id, created, email_address, password_hash) VALUES ($1, $2, $3, $4)",
      [
        opts.account_id,
        new Date(),
        opts.email_address,
        opts.password_hash ?? null,
      ],
    );
  }

  async function insertRememberMe(opts: {
    account_id: string;
    hash: string;
  }): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO remember_me (hash, account_id, value, expire) VALUES ($1, $2, $3, $4)",
      [
        opts.hash,
        opts.account_id,
        JSON.stringify({}),
        new Date(Date.now() + 10000),
      ],
    );
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterEach(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM password_reset_attempts");
    await pool.query("DELETE FROM password_reset");
    await pool.query("DELETE FROM remember_me");
    await pool.query("DELETE FROM accounts");
  });

  afterAll(async () => {
    await testCleanup(database);
  });

  it("change_password updates password and invalidates remember_me by default", async () => {
    const account_id = uuid();
    await insertAccount({
      account_id,
      email_address: "user@example.com",
      password_hash: "old",
    });
    await insertRememberMe({
      account_id,
      hash: "hash-1",
    });

    await changePassword({
      account_id,
      password_hash: "new-hash",
    });

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT password_hash FROM accounts WHERE account_id = $1",
      [account_id],
    );
    expect(rows[0]?.password_hash).toBe("new-hash");

    const { rows: rememberRows } = await pool.query(
      "SELECT hash FROM remember_me WHERE account_id = $1",
      [account_id],
    );
    expect(rememberRows.length).toBe(0);
  });

  it("change_password preserves remember_me when invalidate_remember_me is false", async () => {
    const account_id = uuid();
    await insertAccount({
      account_id,
      email_address: "user@example.com",
      password_hash: "old",
    });
    await insertRememberMe({
      account_id,
      hash: "hash-2",
    });

    await changePassword({
      account_id,
      password_hash: "new-hash",
      invalidate_remember_me: false,
    });

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT hash FROM remember_me WHERE account_id = $1",
      [account_id],
    );
    expect(rows.length).toBe(1);
  });

  it("change_password rejects oversized hashes", async () => {
    const account_id = uuid();
    await insertAccount({
      account_id,
      email_address: "user@example.com",
    });

    await expect(
      changePassword({
        account_id,
        password_hash: "a".repeat(174),
      }),
    ).rejects.toBe("password_hash must be at most 173 characters");
  });

  it("set/get/delete password reset works and respects expiration", async () => {
    const resetId = await setPasswordReset({
      email_address: "user@example.com",
      ttl: 60,
    });

    const email = await getPasswordReset({ id: resetId });
    expect(email).toBe("user@example.com");

    await deletePasswordReset({ id: resetId });
    const deleted = await getPasswordReset({ id: resetId });
    expect(deleted).toBeUndefined();

    const expiredId = await setPasswordReset({
      email_address: "expired@example.com",
      ttl: -1,
    });
    const expired = await getPasswordReset({ id: expiredId });
    expect(expired).toBeUndefined();
  });

  it("record_password_reset_attempt and count_password_reset_attempts respect filters", async () => {
    await recordPasswordResetAttempt({
      email_address: "user@example.com",
      ip_address: "127.0.0.1",
      ttl: 60,
    });
    await recordPasswordResetAttempt({
      email_address: "user@example.com",
      ip_address: "127.0.0.2",
      ttl: 60,
    });

    const pool = getPool();
    const { rows: attemptRows } = await pool.query(
      "SELECT time FROM password_reset_attempts ORDER BY time",
    );
    expect(attemptRows.length).toBe(2);
    expect(attemptRows.every((row) => row.time != null)).toBe(true);

    const threshold = new Date(Date.now() - 60 * 1000);
    const { rows: rawEmailCountRows } = await pool.query(
      "SELECT COUNT(*)::INT AS count FROM password_reset_attempts WHERE time >= $1 AND email_address = $2",
      [threshold, "user@example.com"],
    );
    const expectedEmailCount = rawEmailCountRows[0]?.count ?? 0;

    const countByEmail = await countPasswordResetAttempts({
      email_address: "user@example.com",
      age_s: 60,
    });
    expect(countByEmail).toBe(expectedEmailCount);

    const { rows: rawIpCountRows } = await pool.query(
      "SELECT COUNT(*)::INT AS count FROM password_reset_attempts WHERE time >= $1 AND ip_address = $2",
      [threshold, "127.0.0.1"],
    );
    const expectedIpCount = rawIpCountRows[0]?.count ?? 0;

    const countByIp = await countPasswordResetAttempts({
      ip_address: "127.0.0.1",
      age_s: 60,
    });
    expect(countByIp).toBe(expectedIpCount);
  });

  it("reset_password updates password hash", async () => {
    const account_id = uuid();
    const email_address = "reset@example.com";
    await insertAccount({
      account_id,
      email_address,
      password_hash: "old-hash",
    });
    await insertRememberMe({
      account_id,
      hash: "hash-3",
    });

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await resetPassword({
        email_address,
        password: "new-password",
        random: false,
      });
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT password_hash FROM accounts WHERE account_id = $1",
      [account_id],
    );
    expect(rows[0]?.password_hash).toBe(passwordHash("new-password"));
  });
});
