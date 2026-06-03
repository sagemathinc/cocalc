/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "../types";

export interface GetAccountOptions {
  account_id?: string;
  email_address?: string;
  lti_id?: string[];
  columns?: string[];
}

export interface IsBannedUserOptions {
  account_id?: string;
  email_address?: string;
}

interface AccountWhereClause {
  [key: string]: string | string[];
}

/**
 * Helper function to create WHERE clause for account queries.
 * Priority: account_id > email_address > lti_id
 */
export function accountWhere(opts: {
  account_id?: string;
  email_address?: string;
  lti_id?: string[];
}): AccountWhereClause {
  if (opts.account_id) {
    return { "account_id = $::UUID": opts.account_id };
  } else if (opts.email_address) {
    return { "email_address = $::TEXT": opts.email_address };
  } else if (opts.lti_id) {
    return { "lti_id = $::TEXT[]": opts.lti_id };
  } else {
    throw new Error(
      "postgres-server-queries::_account_where neither account_id, nor email_address, nor lti_id specified and nontrivial",
    );
  }
}

/**
 * Get account information by account_id, email_address, or lti_id.
 *
 * Returns account data with requested columns. Throws "no such account" if not found.
 * Supports virtual column "password_is_set" which is computed from password_hash.
 */
export async function get_account(
  db: PostgreSQL,
  opts: GetAccountOptions,
): Promise<any> {
  // Default columns match CoffeeScript implementation
  const defaultColumns = [
    "account_id",
    "password_hash",
    "password_is_set",
    "first_name",
    "last_name",
    "email_address",
    "evaluate_key",
    "autosave",
    "terminal",
    "editor_settings",
    "other_settings",
    "groups",
    "passports",
  ];

  let columns = [...(opts.columns ?? defaultColumns)];

  // Handle password_is_set virtual column
  let passwordIsSet = false;
  let removePasswordHash = false;

  if (columns.includes("password_is_set")) {
    if (!columns.includes("password_hash")) {
      removePasswordHash = true;
      columns.push("password_hash");
    }
    // Remove password_is_set from columns array since it's not a real column
    columns = columns.filter((c) => c !== "password_is_set");
    passwordIsSet = true;
  }

  const { rows } = await callback2(db._query.bind(db), {
    query: `SELECT ${columns.join(",")} FROM accounts`,
    where: accountWhere(opts),
  });

  if (rows.length === 0) {
    throw "no such account";
  }

  const result: any = rows[0];

  // Add password_is_set virtual field if requested
  if (passwordIsSet) {
    result.password_is_set = !!result.password_hash;
    if (removePasswordHash) {
      delete result.password_hash;
    }
  }

  // Remove undefined fields (for RethinkDB semantics compatibility)
  for (const column of columns) {
    if (result[column] == null) {
      delete result[column];
    }
  }

  return result;
}

/**
 * Check if a user is banned.
 *
 * Returns true if the account has banned=true, false otherwise.
 */
export async function is_banned_user(
  db: PostgreSQL,
  opts: IsBannedUserOptions,
): Promise<boolean> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT banned FROM accounts",
    where: accountWhere(opts),
  });

  if (rows.length === 0) {
    return false;
  }

  return !!rows[0].banned;
}
