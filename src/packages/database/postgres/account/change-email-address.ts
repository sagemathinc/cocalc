/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { account_exists } from "./basic";
import syncCustomer from "../stripe/sync-customer";
import type { PostgreSQL } from "../types";

interface ChangeEmailAddressOptions {
  account_id: string;
  email_address: string;
  stripe: any;
}

/**
 * Change the email address for an account.
 *
 * Throws "email_already_taken" error (string) if the email is already in use.
 * Calls Stripe sync if account has stripe_customer_id.
 *
 * NOTE: Matches CoffeeScript behavior but fixes bug where undefined account
 * would crash when accessing stripe_customer_id.
 */
export async function changeEmailAddress(
  db: PostgreSQL,
  opts: ChangeEmailAddressOptions,
): Promise<void> {
  // Validate options
  const valid = db._validate_opts(opts);
  if (!valid) {
    throw new Error("Invalid options");
  }

  // Step 1: Check if email is already taken
  const exists = await account_exists(db, {
    email_address: opts.email_address,
  });

  if (exists) {
    // Match CoffeeScript behavior: throw string, not Error
    throw "email_already_taken";
  }

  // Step 2: Update email address in database
  await db.async_query({
    query: "UPDATE accounts",
    set: { email_address: opts.email_address },
    where: { "account_id = $::UUID": opts.account_id },
  });

  // Step 3: Sync with Stripe if customer exists
  const result = await db.async_query({
    query: "SELECT stripe_customer_id FROM accounts",
    where: { "account_id = $::UUID": opts.account_id },
  });

  const row = result.rows?.[0];

  // FIX: Check if row exists before accessing stripe_customer_id
  // This fixes the CoffeeScript bug where undefined account would crash
  if (row?.stripe_customer_id) {
    await syncCustomer({
      account_id: opts.account_id,
      stripe: opts.stripe,
      customer_id: row.stripe_customer_id,
    });
  }
}
