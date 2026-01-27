/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// DEVELOPMENT: use scripts/auth/gen-sso.py to generate some test data

import { PassportStrategyDB } from "@cocalc/database/settings/auth-sso-types";
import {
  getPassportsCached,
  setPassportsCached,
} from "@cocalc/database/settings/server-settings";
import { to_json } from "@cocalc/util/misc";
import { CB } from "@cocalc/util/types/database";
import {
  set_account_info_if_different,
  set_account_info_if_not_set,
  set_email_address_verified,
} from "./queries";
import {
  CreatePassportOpts,
  PassportExistsOpts,
  PostgreSQL,
  UpdateAccountInfoAndPassportOpts,
} from "../types";
import { _passport_key } from "./passport-key";

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
      db: db,
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

export async function update_account_and_passport(
  db: PostgreSQL,
  opts: UpdateAccountInfoAndPassportOpts,
) {
  // we deliberately do not update the email address, because if the SSO
  // strategy sends a different one, this would break the "link".
  // rather, if the email (and hence most likely the email address) changes on the
  // SSO side, this would equal to creating a new account.
  const dbg = db._dbg("update_account_and_passport");
  dbg(
    `updating account info ${to_json({
      first_name: opts.first_name,
      last_name: opts.last_name,
    })}`,
  );
  await set_account_info_if_different({
    db: db,
    account_id: opts.account_id,
    first_name: opts.first_name,
    last_name: opts.last_name,
  });
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
}
