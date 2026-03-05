/*
 *  This file is part of CoCalc: Copyright © 2022-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// DEVELOPMENT: use scripts/auth/gen-sso.py to generate some test data

import { PassportStrategyDB } from "@cocalc/database/settings/auth-sso-types";
import {
  getPassportsCached,
  setPassportsCached,
} from "@cocalc/database/settings/server-settings";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { lower_email_address, to_json } from "@cocalc/util/misc";
import { CB } from "@cocalc/util/types/database";
import {
  set_account_info_if_different,
  set_account_info_if_not_set,
  set_email_address_verified,
} from "./account-queries";
import {
  CreatePassportOpts,
  PassportExistsOpts,
  PostgreSQL,
  SetAccountFields,
  UpdateAccountInfoAndPassportOpts,
} from "./types";

export async function set_passport_settings(
  db: PostgreSQL,
  opts: PassportStrategyDB & { cb?: CB },
): Promise<void> {
  const { strategy, conf, info } = opts;
  let err = null;
  try {
    await db.async_query({
      query: "INSERT INTO passport_settings",
      values: {
        "strategy::TEXT ": strategy,
        "conf    ::JSONB": conf,
        "info    ::JSONB": info,
      },
      conflict: "strategy",
    });
  } catch (err) {
    err = err;
  }
  if (typeof opts.cb === "function") {
    opts.cb(err);
  }
}

export async function get_passport_settings(
  db: PostgreSQL,
  opts: { strategy: string; cb?: (data: object) => void },
): Promise<any> {
  const { rows } = await db.async_query({
    query: "SELECT conf, info FROM passport_settings",
    where: { "strategy = $::TEXT": opts.strategy },
  });
  if (typeof opts.cb === "function") {
    opts.cb(rows[0]);
  }
  return rows[0];
}

export async function get_all_passport_settings(
  db: PostgreSQL,
): Promise<PassportStrategyDB[]> {
  return (
    await db.async_query<PassportStrategyDB>({
      query: "SELECT strategy, conf, info FROM passport_settings",
    })
  ).rows;
}

export async function get_all_passport_settings_cached(
  db: PostgreSQL,
): Promise<PassportStrategyDB[]> {
  const passports = getPassportsCached();
  if (passports != null) {
    return passports;
  }
  const res = await get_all_passport_settings(db);
  setPassportsCached(res);
  return res;
}

// Passports -- accounts linked to Google/Dropbox/Facebook/Github, etc.
// The Schema is slightly redundant, but indexed properly:
//    {passports:['google-id', 'facebook-id'],  passport_profiles:{'google-id':'...', 'facebook-id':'...'}}

export function _passport_key(opts) {
  const { strategy, id } = opts;
  // note: strategy is *our* name of the strategy in the DB, not it's type string!
  if (typeof strategy !== "string") {
    throw new Error("_passport_key: strategy must be defined");
  }
  if (typeof id !== "string") {
    throw new Error("_passport_key: id must be defined");
  }

  return `${strategy}-${id}`;
}

export async function create_passport(
  db: PostgreSQL,
  opts: CreatePassportOpts,
): Promise<void> {
  const dbg = db._dbg("create_passport");
  dbg({ id: opts.id, strategy: opts.strategy, profile: to_json(opts.profile) });

  try {
    dbg("setting the passport for the account");
    await db.async_query({
      query: "UPDATE accounts",
      jsonb_set: {
        passports: { [_passport_key(opts)]: opts.profile },
      },
      where: {
        "account_id = $::UUID": opts.account_id,
      },
    });

    dbg(
      `setting other account info ${opts.account_id}: ${opts.email_address}, ${opts.first_name}, ${opts.last_name}`,
    );
    await set_account_info_if_not_set({
      db,
      account_id: opts.account_id,
      email_address: opts.email_address,
      first_name: opts.first_name,
      last_name: opts.last_name,
    });
    // we still record that email address as being verified
    if (opts.email_address != null) {
      await set_email_address_verified({
        db,
        account_id: opts.account_id,
        email_address: opts.email_address,
      });
    }
    opts.cb?.(undefined); // all good
  } catch (err) {
    if (opts.cb != null) {
      opts.cb(err);
    } else {
      throw err;
    }
  }
}

export async function passport_exists(
  db: PostgreSQL,
  opts: PassportExistsOpts,
): Promise<string | undefined> {
  try {
    const result = await db.async_query({
      query: "SELECT account_id FROM accounts",
      where: [
        // this uses the corresponding index to only scan a subset of all accounts!
        "passports IS NOT NULL",
        { "(passports->>$::TEXT) IS NOT NULL": _passport_key(opts) },
      ],
    });
    const account_id = result?.rows[0]?.account_id;
    if (opts.cb != null) {
      opts.cb(null, account_id);
    } else {
      return account_id;
    }
  } catch (err) {
    if (opts.cb != null) {
      opts.cb(err);
    } else {
      throw err;
    }
  }
}

// this is only used in passport-login/maybeUpdateAccountAndPassport!
export async function update_account_and_passport(
  db: PostgreSQL,
  opts: UpdateAccountInfoAndPassportOpts,
) {
  // This also updates the email address, if it is set in opts and does not exist with another account yet.
  // NOTE: this changed in July 2024. Prior to that, changing the email address of the same account (by ID) in SSO,
  // would not change the email address.
  const dbg = db._dbg("update_account_and_passport");
  dbg(
    `updating account info ${to_json({
      first_name: opts.first_name,
      last_name: opts.last_name,
      email_addres: opts.email_address,
    })}`,
  );

  const upd: SetAccountFields = {
    db: db,
    account_id: opts.account_id,
    first_name: opts.first_name,
    last_name: opts.last_name,
  };

  // Only check for existing email if email_address is provided by SSO
  // (Some SSO providers don't return email addresses)
  if (opts.email_address) {
    const email_address = lower_email_address(opts.email_address);
    // Most likely, this just returns the very same account (since the account already exists).
    const existing_account_id = await cb2(db.account_exists, {
      email_address,
    });

    if (!existing_account_id) {
      // There is no account with the new email address, hence we can update the email address as well
      upd.email_address = email_address;
      dbg(
        `No existing account with email address ${email_address}. Therefore, we change the email address of account ${opts.account_id} as well.`,
      );
    }
  }

  // this set_account_info_if_different checks again if the email exists on another account, but it would throw an error.
  const { email_changed } = await set_account_info_if_different(upd);
  const key = _passport_key(opts);
  dbg(`updating passport ${to_json({ key, profile: opts.profile })}`);
  await db.async_query({
    query: "UPDATE accounts",
    jsonb_set: {
      passports: { [key]: opts.profile },
    },
    where: {
      "account_id = $::UUID": opts.account_id,
    },
  });

  // since we update the email address of an account based on a change from the SSO mechanism
  // we can assume the new email address is also "verified"
  if (email_changed && typeof upd.email_address === "string") {
    await set_email_address_verified({
      db,
      account_id: opts.account_id,
      email_address: upd.email_address,
    });
  }
}
