/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { seconds_ago } from "@cocalc/util/misc";
import { callback2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "./types";
import { get_account } from "./account-core";

export interface MakeUserAdminOptions {
  account_id?: string;
  email_address?: string;
}

export interface CountAccountsCreatedByOptions {
  ip_address: string;
  age_s: number;
}

/**
 * Make a user an admin by setting their groups to ['admin'].
 * Can lookup by account_id or email_address.
 * Clears the cache after updating (important for permission checks).
 */
export async function make_user_admin(
  db: PostgreSQL,
  opts: MakeUserAdminOptions,
): Promise<void> {
  if (!opts.account_id && !opts.email_address) {
    throw "account_id or email_address must be given";
  }

  let account_id = opts.account_id;

  // If email_address provided, lookup account_id first
  if (!account_id && opts.email_address) {
    const account = await get_account(db, {
      email_address: opts.email_address,
      columns: ["account_id"],
    });
    account_id = account.account_id;
  }

  // Clear cache before updating (important for permission checks)
  db.clear_cache();

  // Update the account to be admin
  await callback2(db._query.bind(db), {
    query: "UPDATE accounts",
    where: { "account_id = $::UUID": account_id },
    set: {
      groups: ["admin"],
    },
  });
}

/**
 * Count accounts created by a specific IP address within a time window.
 * Returns the number of accounts created by the IP in the last age_s seconds.
 */
export async function count_accounts_created_by(
  db: PostgreSQL,
  opts: CountAccountsCreatedByOptions,
): Promise<number> {
  const result = await callback2(db._query.bind(db), {
    query: "SELECT COUNT(*) FROM accounts",
    where: {
      "created_by  = $::INET": opts.ip_address,
      "created    >= $::TIMESTAMP": seconds_ago(opts.age_s),
    },
  });

  return parseInt(result.rows?.[0]?.count ?? 0);
}

/**
 * Update the last_active timestamp for an account.
 * Uses throttling to prevent excessive updates (120 second window).
 */
export async function touchAccount(
  db: PostgreSQL,
  account_id: string,
): Promise<void> {
  // Check throttle - if we touched this account in last 120 seconds, skip
  if (db._throttle("_touch_account", 120, account_id)) {
    return;
  }

  await callback2(db._query.bind(db), {
    query: "UPDATE accounts",
    set: { last_active: "NOW()" },
    where: { "account_id = $::UUID": account_id },
  });
}
