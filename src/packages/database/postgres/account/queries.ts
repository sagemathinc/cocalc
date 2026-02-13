/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Various functions involving the database and accounts.

import { callback2 } from "@cocalc/util/async-utils";
import {
  assert_valid_account_id,
  assert_valid_email_address,
  len,
} from "@cocalc/util/misc";
import { is_a_site_license_manager } from "../site-license/search";
import { PostgreSQL, SetAccountFields } from "../types";
//import getLogger from "@cocalc/backend/logger";
//const L = getLogger("db:pg:account-queries");

/* For now we define "paying customer" to mean they have a subscription.
  It's OK if it expired.  They at least bought one once.
  This is mainly used for anti-abuse purposes...

  TODO: modernize this or don't use this at all...
*/
export async function is_paying_customer(
  db: PostgreSQL,
  account_id: string,
): Promise<boolean> {
  let x;
  try {
    x = await callback2(db.get_account, {
      account_id,
      columns: ["stripe_customer"],
    });
  } catch (_err) {
    // error probably means there is no such account or account_id is badly formatted.
    return false;
  }
  if (!!x.stripe_customer?.subscriptions?.total_count) {
    // they have at least one subscription of some form -- so that's enough to count.
    return true;
  }
  // If they manage any licenses then they also count:
  return await is_a_site_license_manager(db, account_id);
}

// this is like set_account_info_if_different, but only sets the fields if they're not set
export async function set_account_info_if_not_set(
  opts: SetAccountFields,
): Promise<{ email_changed: boolean }> {
  return await set_account_info_if_different(opts, false);
}

// This sets the given fields of an account, if it is different from the current value  – except for the email address, which we only set but not change
export async function set_account_info_if_different(
  opts: SetAccountFields,
  overwrite = true,
): Promise<{ email_changed: boolean }> {
  const columns = ["email_address", "first_name", "last_name"];

  // this could throw an error for "no such account"
  const account = await get_account<{
    email_address: string;
    first_name: string;
    last_name: string;
  }>(opts.db, opts.account_id, columns);

  const do_set: { [field: string]: string } = {};
  let do_email: string | undefined = undefined;

  for (const field of columns) {
    if (typeof opts[field] !== "string") continue;
    if (!overwrite && account[field] != null) continue;
    if (account[field] != opts[field]) {
      if (field === "email_address") {
        do_email = opts[field];
      } else {
        do_set[field] = opts[field];
      }
    }
  }
  if (len(do_set) > 0) {
    await set_account(opts.db, opts.account_id, do_set);
  }

  if (do_email) {
    if (account["email_address"] != null) {
      // if it changes, we have to call the change_email_address function
      await callback2(opts.db.change_email_address.bind(opts.db), {
        account_id: opts.account_id,
        email_address: do_email,
      });
    } else {
      const existing_account_id = await callback2(
        opts.db.account_exists.bind(opts.db),
        {
          email_address: do_email,
        },
      );
      if (existing_account_id) {
        throw "email_already_taken";
      }
      await set_account(opts.db, opts.account_id, {
        email_address: do_email,
      });
    }
    // Just changed email address - might be added to a project...
    await callback2(opts.db.do_account_creation_actions.bind(opts.db), {
      email_address: do_email,
      account_id: opts.account_id,
    });
  }

  return { email_changed: !!do_email };
}

export async function set_account(
  db: PostgreSQL,
  account_id: string,
  set: { [field: string]: any },
): Promise<void> {
  await db.async_query({
    query: "UPDATE accounts",
    where: { "account_id = $::UUID": account_id },
    set,
  });
}

// TODO typing: pick the column fields from the actual account type stored in the database
export async function get_account<T>(
  db: PostgreSQL,
  account_id: string,
  columns: string[],
): Promise<T> {
  return await callback2(db.get_account.bind(db), {
    account_id,
    columns,
  });
}

export async function get_email_address_for_account_id(
  db: PostgreSQL,
  account_id: string,
): Promise<string | undefined> {
  assert_valid_account_id(account_id);
  const { rows } = await db.async_query<{ email_address?: string }>({
    query: "SELECT email_address FROM accounts",
    where: { "account_id = $::UUID": account_id },
  });
  if (rows.length === 0) {
    return undefined;
  }
  return rows[0].email_address ?? undefined;
}

interface SetEmailAddressVerifiedOpts {
  db: PostgreSQL;
  account_id: string;
  email_address: string;
}

export async function set_email_address_verified(
  opts: SetEmailAddressVerifiedOpts,
): Promise<void> {
  const { db, account_id, email_address } = opts;
  assert_valid_account_id(account_id);
  assert_valid_email_address(email_address);
  await db.async_query({
    query: "UPDATE accounts",
    jsonb_set: { email_address_verified: { [email_address]: new Date() } },
    where: { "account_id = $::UUID": account_id },
  });
}

export async function is_admin(
  db: PostgreSQL,
  account_id: string,
): Promise<boolean> {
  const { groups } = await get_account<{ groups?: string[] }>(db, account_id, [
    "groups",
  ]);
  return Array.isArray(groups) && groups.includes("admin");
}
