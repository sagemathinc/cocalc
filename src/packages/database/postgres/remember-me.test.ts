/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "./types";

function makeHash(length: number): string {
  const base = uuid().replace(/-/g, "");
  return (base + "x".repeat(length)).slice(0, length);
}

describe("remember me methods", () => {
  const database: PostgreSQL = db();

  async function get_remember_me_wrapper(opts: {
    hash: string;
    cache?: boolean;
  }): Promise<{ event: "signed_in"; account_id: string } | undefined> {
    return callback_opts(database.get_remember_me.bind(database))(opts);
  }

  async function invalidate_all_remember_me_wrapper(opts: {
    account_id?: string;
    email_address?: string;
  }): Promise<void> {
    await callback_opts(database.invalidate_all_remember_me.bind(database))(
      opts,
    );
  }

  async function delete_remember_me_wrapper(opts: {
    hash: string;
  }): Promise<void> {
    await callback_opts(database.delete_remember_me.bind(database))(opts);
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    db()._close_test_query?.();
    await getPool().end();
  });

  describe("get_remember_me", () => {
    it("returns signed_in message for a valid hash", async () => {
      const pool = getPool();
      const accountId = uuid();
      const hash = makeHash(64);
      const expire = new Date(Date.now() + 60 * 1000);

      await pool.query(
        "INSERT INTO remember_me (hash, value, account_id, expire) VALUES ($1, $2, $3, $4)",
        [hash, { test: true }, accountId, expire],
      );

      const result = await get_remember_me_wrapper({
        hash,
        cache: false,
      });

      expect(result).toEqual({ event: "signed_in", account_id: accountId });
    });

    it("returns undefined for an expired hash", async () => {
      const pool = getPool();
      const accountId = uuid();
      const hash = makeHash(64);
      const expire = new Date(Date.now() - 60 * 1000);

      await pool.query(
        "INSERT INTO remember_me (hash, value, account_id, expire) VALUES ($1, $2, $3, $4)",
        [hash, { test: "expired" }, accountId, expire],
      );

      const result = await get_remember_me_wrapper({ hash });
      expect(result).toBeUndefined();
    });
  });

  describe("invalidate_all_remember_me", () => {
    it("deletes all entries for an account", async () => {
      const pool = getPool();
      const accountId = uuid();
      const otherAccountId = uuid();
      const expire = new Date(Date.now() + 60 * 1000);

      await pool.query(
        "INSERT INTO remember_me (hash, value, account_id, expire) VALUES ($1, $2, $3, $4)",
        [makeHash(32), { test: 1 }, accountId, expire],
      );
      await pool.query(
        "INSERT INTO remember_me (hash, value, account_id, expire) VALUES ($1, $2, $3, $4)",
        [makeHash(32), { test: 2 }, accountId, expire],
      );
      await pool.query(
        "INSERT INTO remember_me (hash, value, account_id, expire) VALUES ($1, $2, $3, $4)",
        [makeHash(32), { test: 3 }, otherAccountId, expire],
      );

      await invalidate_all_remember_me_wrapper({ account_id: accountId });

      const { rows: remaining } = await pool.query(
        "SELECT COUNT(*) FROM remember_me WHERE account_id = $1",
        [accountId],
      );
      expect(parseInt(remaining[0].count)).toBe(0);

      const { rows: otherRemaining } = await pool.query(
        "SELECT COUNT(*) FROM remember_me WHERE account_id = $1",
        [otherAccountId],
      );
      expect(parseInt(otherRemaining[0].count)).toBe(1);
    });
  });

  describe("delete_remember_me", () => {
    it("deletes entry by hash", async () => {
      const pool = getPool();
      const accountId = uuid();
      const expire = new Date(Date.now() + 60 * 1000);
      const hash = makeHash(127);

      await pool.query(
        "INSERT INTO remember_me (hash, value, account_id, expire) VALUES ($1, $2, $3, $4)",
        [hash, { test: "delete" }, accountId, expire],
      );

      await delete_remember_me_wrapper({ hash: `${hash}extra` });

      const { rows } = await pool.query(
        "SELECT COUNT(*) FROM remember_me WHERE hash = $1",
        [hash],
      );
      expect(parseInt(rows[0].count)).toBe(0);
    });
  });
});
