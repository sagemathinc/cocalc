/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  getPassportsCached,
  setPassportsCached,
} from "@cocalc/server/settings/server-settings";
import { CB, PostgreSQL } from "./types";

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
] as const;

export type PassportTypes = typeof PassportTypesList[number];

export interface PassportStrategyDBConfig {
  type: PassportTypes;
  clientID?: string; // Google, Twitter, ... and OAuth2
  clientSecret?: string; // Google, Twitter, ... and OAuth2
  authorizationURL?: string; // OAuth2
  tokenURL?: string; // --*--
  userinfoURL?: string; // OAuth2, to get a profile
  login_info?: { [key in LoginInfoKeys]?: string }; // extracting fields from the returned profile, uses "dot-object", e.g. { emails: "emails[0].value" }
}

export interface PassportStrategyDBInfo {
  public?: boolean; // default true
  exclusive_domains?: string[]; // list of domains, e.g. ["foo.com"], which must go through that SSO mechanism (and hence block normal email signup)
  display?: string; // e.g. "WOW Tech", fallback: capitalize(strategy)
  description?: string; // markdown
  icon?: string; // URL to a square image
  disabled?: boolean; // if true, ignore this entry. default false.
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
