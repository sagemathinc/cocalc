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

describe("coupon and username query methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  describe("get_coupon_history", () => {
    it("returns coupon history for an account", async () => {
      const pool = getPool();
      const accountId = uuid();
      const couponHistory = { COUPON123: { used: true, date: "2024-01-15" } };

      // Create account with coupon history
      await pool.query(
        "INSERT INTO accounts (account_id, coupon_history) VALUES ($1, $2)",
        [accountId, JSON.stringify(couponHistory)],
      );

      const result = await callback_opts(
        database.get_coupon_history.bind(database),
      )({
        account_id: accountId,
      });

      expect(result).toEqual(couponHistory);
    });

    it("returns undefined for account with no coupon history", async () => {
      const pool = getPool();
      const accountId = uuid();

      // Create account without coupon history
      await pool.query("INSERT INTO accounts (account_id) VALUES ($1)", [
        accountId,
      ]);

      const result = await callback_opts(
        database.get_coupon_history.bind(database),
      )({
        account_id: accountId,
      });

      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent account", async () => {
      const accountId = uuid();

      const result = await callback_opts(
        database.get_coupon_history.bind(database),
      )({
        account_id: accountId,
      });

      expect(result).toBeUndefined();
    });
  });

  describe("update_coupon_history", () => {
    it("updates coupon history for an account", async () => {
      const pool = getPool();
      const accountId = uuid();
      const initialHistory = { OLD123: { used: true } };
      const updatedHistory = {
        OLD123: { used: true },
        NEW456: { used: false, date: "2024-12-30" },
      };

      // Create account with initial coupon history
      await pool.query(
        "INSERT INTO accounts (account_id, coupon_history) VALUES ($1, $2)",
        [accountId, JSON.stringify(initialHistory)],
      );

      await callback_opts(database.update_coupon_history.bind(database))({
        account_id: accountId,
        coupon_history: updatedHistory,
      });

      // Verify update
      const { rows } = await pool.query(
        "SELECT coupon_history FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(rows[0].coupon_history).toEqual(updatedHistory);
    });

    it("sets coupon history for account without existing history", async () => {
      const pool = getPool();
      const accountId = uuid();
      const newHistory = { FIRST789: { used: true, date: "2024-12-30" } };

      // Create account without coupon history
      await pool.query("INSERT INTO accounts (account_id) VALUES ($1)", [
        accountId,
      ]);

      await callback_opts(database.update_coupon_history.bind(database))({
        account_id: accountId,
        coupon_history: newHistory,
      });

      // Verify history was set
      const { rows } = await pool.query(
        "SELECT coupon_history FROM accounts WHERE account_id = $1",
        [accountId],
      );
      expect(rows[0].coupon_history).toEqual(newHistory);
    });
  });

  describe("account_ids_to_usernames", () => {
    it("returns mapping of account IDs to names", async () => {
      const pool = getPool();
      const account1 = uuid();
      const account2 = uuid();
      const account3 = uuid();

      // Create accounts with names
      await pool.query(
        "INSERT INTO accounts (account_id, first_name, last_name) VALUES ($1, $2, $3)",
        [account1, "Alice", "Anderson"],
      );
      await pool.query(
        "INSERT INTO accounts (account_id, first_name, last_name) VALUES ($1, $2, $3)",
        [account2, "Bob", "Brown"],
      );
      await pool.query(
        "INSERT INTO accounts (account_id, first_name, last_name) VALUES ($1, $2, $3)",
        [account3, "Charlie", "Chen"],
      );

      const result = await callback_opts(
        database.account_ids_to_usernames.bind(database),
      )({
        account_ids: [account1, account2, account3],
      });

      expect(result).toEqual({
        [account1]: { first_name: "Alice", last_name: "Anderson" },
        [account2]: { first_name: "Bob", last_name: "Brown" },
        [account3]: { first_name: "Charlie", last_name: "Chen" },
      });
    });

    it("fills in undefined for unknown accounts", async () => {
      const pool = getPool();
      const knownAccount = uuid();
      const unknownAccount = uuid();

      // Create only one account
      await pool.query(
        "INSERT INTO accounts (account_id, first_name, last_name) VALUES ($1, $2, $3)",
        [knownAccount, "David", "Davis"],
      );

      const result = await callback_opts(
        database.account_ids_to_usernames.bind(database),
      )({
        account_ids: [knownAccount, unknownAccount],
      });

      expect(result).toEqual({
        [knownAccount]: { first_name: "David", last_name: "Davis" },
        [unknownAccount]: { first_name: undefined, last_name: undefined },
      });
    });

    it("handles empty account_ids array", async () => {
      const result = await callback_opts(
        database.account_ids_to_usernames.bind(database),
      )({
        account_ids: [],
      });

      expect(result).toEqual([]);
    });

    it("handles accounts with missing names", async () => {
      const pool = getPool();
      const account1 = uuid();
      const account2 = uuid();

      // Create account with first name only
      await pool.query(
        "INSERT INTO accounts (account_id, first_name) VALUES ($1, $2)",
        [account1, "Eve"],
      );
      // Create account with last name only
      await pool.query(
        "INSERT INTO accounts (account_id, last_name) VALUES ($1, $2)",
        [account2, "Franklin"],
      );

      const result = await callback_opts(
        database.account_ids_to_usernames.bind(database),
      )({
        account_ids: [account1, account2],
      });

      expect(result).toEqual({
        [account1]: { first_name: "Eve", last_name: null },
        [account2]: { first_name: null, last_name: "Franklin" },
      });
    });
  });
});
