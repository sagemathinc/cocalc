/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";
import { account_exists } from "./basic";

interface DeleteAccountOptions {
  account_id: string;
}

interface MarkAccountDeletedOptions {
  account_id?: string;
  email_address?: string;
}

/**
 * Completely delete an account from the database.
 *
 * WARNING: This doesn't do any sort of cleanup of things associated with the account!
 * There is no reason to ever use this, except for testing purposes.
 *
 * This performs a hard DELETE - the account record is completely removed from the database.
 */
export async function deleteAccount(
  db: PostgreSQL,
  opts: DeleteAccountOptions,
): Promise<void> {
  const valid = db._validate_opts(opts);
  if (!valid) {
    throw new Error("Invalid options");
  }

  await db.async_query({
    query: "DELETE FROM accounts",
    where: { "account_id = $::UUID": opts.account_id },
  });
}

/**
 * Mark an account as deleted, freeing up the email address for use by another account.
 *
 * The actual account entry remains in the database, since it may be referred to by
 * many other things (projects, logs, etc.). However, the deleted field is set to true,
 * so the account is excluded from user search.
 *
 * This operation:
 * - Sets deleted = true
 * - Saves the email address to email_address_before_delete
 * - Clears email_address (sets to null)
 * - Clears passports (sets to null)
 *
 * Either account_id or email_address must be provided.
 *
 * NOTE: This has been rewritten in packages/server/accounts/delete.ts,
 * but this version is kept for backward compatibility.
 */
export async function markAccountDeleted(
  db: PostgreSQL,
  opts: MarkAccountDeletedOptions,
): Promise<void> {
  // Validate that at least one identifier is provided
  if (!opts.account_id && !opts.email_address) {
    throw new Error(
      "one of email address or account_id must be specified -- make sure you are signed in",
    );
  }

  let account_id = opts.account_id;
  let email_address: string | undefined;

  // If account_id not provided, look it up by email
  if (!account_id) {
    account_id = await account_exists(db, {
      email_address: opts.email_address!,
    });
    if (!account_id) {
      throw new Error("no such email address known");
    }
  }

  // Get the current email address
  const result = await db.async_query({
    query: "SELECT email_address FROM accounts",
    where: { "account_id = $::UUID": account_id },
  });

  if (!result.rows || result.rows.length === 0) {
    throw new Error("account not found");
  }

  email_address = result.rows[0].email_address;

  // Mark the account as deleted
  await db.async_query({
    query: "UPDATE accounts",
    set: {
      "deleted::BOOLEAN": true,
      "email_address_before_delete::TEXT": email_address,
      email_address: null,
      passports: null,
    },
    where: { "account_id = $::UUID": account_id },
  });
}
