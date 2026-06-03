/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "../types";

export interface IsAdminOptions {
  account_id: string;
}

export interface UserIsInGroupOptions {
  account_id: string;
  group: string;
}

export interface AccountExistsOptions {
  email_address: string;
}

/**
 * Check if a user is an admin.
 *
 * Returns true if the account has 'admin' in their groups array, false otherwise.
 */
export async function is_admin(
  db: PostgreSQL,
  opts: IsAdminOptions,
): Promise<boolean> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT groups FROM accounts",
    where: { "account_id = $::UUID": opts.account_id },
    cache: true,
  });

  if (rows.length === 0) {
    return false;
  }

  const groups: string[] | undefined = rows[0].groups;
  return groups != null && groups.includes("admin");
}

/**
 * Check if a user is in a specific group.
 *
 * Returns true if the account has the specified group in their groups array.
 */
export async function user_is_in_group(
  db: PostgreSQL,
  opts: UserIsInGroupOptions,
): Promise<boolean> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT groups FROM accounts",
    where: { "account_id = $::UUID": opts.account_id },
    cache: true,
  });

  if (rows.length === 0) {
    return false;
  }

  const groups: string[] | undefined = rows[0].groups;
  return groups != null && groups.includes(opts.group);
}

/**
 * Check if an account exists by email address.
 *
 * Returns the account_id if found, undefined otherwise.
 */
export async function account_exists(
  db: PostgreSQL,
  opts: AccountExistsOptions,
): Promise<string | undefined> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT account_id FROM accounts",
    where: { "email_address = $::TEXT": opts.email_address },
  });

  if (rows.length === 0) {
    return undefined;
  }

  return rows[0].account_id;
}
