/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// DEVELOPMENT: use scripts/auth/gen-sso.py to generate some test data

import {
  getPassportsCached,
  setPassportsCached,
} from "@cocalc/server/settings/server-settings";
import { to_json } from "@cocalc/util/misc";
import { set_account_info_if_possible } from "./account-queries";
import {
  CB,
  CreatePassportOpts,
  DeletePassportOpts,
  PassportExistsOpts,
  PostgreSQL,
  UpdateAccountInfoAndPassportOpts,
} from "./types";

export type LoginInfoKeys = "id" | "first_name" | "last_name" | "emails";

// google, facebook, etc ... are not included, they're hardcoded
export const PassportTypesList = [
  "email", // special case, always included by default, not a passport strategy
  "activedirectory",
  "ldap",
  "oauth1",
  "oauth2",
  "oauth2next",
  "orcid",
  "saml",
  "gitlab2",
  "apple",
  "microsoft",
  "azure-ad",
  // the 4 types for google, twitter, github and facebook are not included here – they're hardcoded special cases
] as const;

export type PassportTypes = typeof PassportTypesList[number];

export type PassportLoginInfo = { [key in LoginInfoKeys]?: string };
export interface PassportStrategyDBConfig {
  type: PassportTypes;
  clientID?: string; // Google, Twitter, ... and OAuth2
  clientSecret?: string; // Google, Twitter, ... and OAuth2
  authorizationURL?: string; // OAuth2
  tokenURL?: string; // --*--
  userinfoURL?: string; // OAuth2, to get a profile
  login_info?: PassportLoginInfo; // extracting fields from the returned profile, uses "dot-object", e.g. { emails: "emails[0].value" }
  auth_opts?: { [key: string]: string }; // auth options, typed as AuthenticateOptions but OAuth2 has one which isn't part of the type – hence we keep it general
}

export interface PassportStrategyDBInfo {
  public?: boolean; // default true
  do_not_hide?: boolean; // default false, only relevant for public=false SSOs, which will be shown on the login/signup page directly
  exclusive_domains?: string[]; // list of domains, e.g. ["foo.com"], which must go through that SSO mechanism (and hence block normal email signup)
  display?: string; // e.g. "WOW Tech", fallback: capitalize(strategy)
  description?: string; // markdown
  icon?: string; // URL to a square image
  disabled?: boolean; // if true, ignore this entry. default false.
  update_on_login?: boolean; // if true, update the user's info on login. default false.
  cookie_ttl_s?: number; // default is about a month
}

// those are the 3 columns in the DB table
export interface PassportStrategyDB {
  strategy: string;
  conf: PassportStrategyDBConfig;
  info?: PassportStrategyDBInfo;
}

export async function set_passport_settings(
  db: PostgreSQL,
  opts: PassportStrategyDB & { cb?: CB }
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
  opts: { strategy: string; cb?: CB }
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
  db: PostgreSQL
): Promise<PassportStrategyDB[]> {
  return (
    await db.async_query({
      query: "SELECT strategy, conf, info FROM passport_settings",
    })
  ).rows;
}

export async function get_all_passport_settings_cached(
  db: PostgreSQL
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
  return `${opts.strategy}-${opts.id}`;
}

export async function create_passport(
  db: PostgreSQL,
  opts: CreatePassportOpts
): Promise<void> {
  const dbg = db._dbg("create_passport");
  dbg(to_json(opts.profile));

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
      `setting other account info ${opts.email_address}, ${opts.first_name}, ${opts.last_name}`
    );
    await set_account_info_if_possible({
      db: db,
      account_id: opts.account_id,
      email_address: opts.email_address,
      first_name: opts.first_name,
      last_name: opts.last_name,
    });
    opts.cb?.(null);
  } catch (err) {
    if (opts.cb != null) {
      opts.cb(err);
    } else {
      throw err;
    }
  }
}

export async function delete_passport(
  db: PostgreSQL,
  opts: DeletePassportOpts
) {
  db._dbg("delete_passport")(to_json({ strategy: opts.strategy, id: opts.id }));
  return db._query({
    query: "UPDATE accounts",
    jsonb_set: {
      // delete it
      passports: { [_passport_key(opts)]: null },
    },
    where: {
      "account_id = $::UUID": opts.account_id,
    },
    cb: opts.cb,
  });
}

export async function passport_exists(
  db: PostgreSQL,
  opts: PassportExistsOpts
) {
  try {
    const result = await db.async_query({
      query: "SELECT account_id FROM accounts",
      where: { "(passports->>$::TEXT) IS NOT NULL": _passport_key(opts) },
    });
    const aid = result?.rows[0]?.account_id;
    if (opts.cb != null) {
      opts.cb(null, aid);
    } else {
      return aid;
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
  opts: UpdateAccountInfoAndPassportOpts
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
    })}`
  );
  await set_account_info_if_possible({
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
