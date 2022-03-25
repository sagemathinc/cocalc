/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
For development, this is a list of commands to get some suitable test data into your DB:

-- DELETE FROM passport_settings;

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'food',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"}, "display": "Food University", "icon": "https://img.icons8.com/glyph-neue/344/food-and-wine.png"}'::JSONB,
    '{"description": "This is the SSO mechanism for anyone associated with Food University", "public": false, "exclusive_domains": ["food.edu"]}'::JSONB
);

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'abacus',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"} }'::JSONB,
    '{"description": "This is the SSO mechanism for anyone associated with Abacus Inc", "public": false, "exclusive_domains": ["abacus.edu", "dadacus.edu", "nadacus.edu", "blablacus.edu"], "display": "Abacus Inc.", "icon": "https://img.icons8.com/external-smashingstocks-outline-color-smashing-stocks/344/external-abacus-online-education-smashingstocks-outline-color-smashing-stocks.png"}'::JSONB
);

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'flight',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"}}'::JSONB,
    '{"description": "This is to sign up with CoCalc as a student of **Flight Research International, Inc.**\n\nMore information:\n\n- [airplane.edu](http://airplane.edu/)\n\n- [yet another link](http://nowhere.com)", "public": false, "exclusive_domains": ["airplane.edu", "aircraft.com"], "display": "Flight Research", "icon": "https://img.icons8.com/external-kiranshastry-solid-kiranshastry/344/external-flight-interface-kiranshastry-solid-kiranshastry.png" }'::JSONB
);

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'minimal',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"}, "display": "Minimal", "icon": "https://img.icons8.com/external-others-zulfa-mahendra/344/external-animal-halloween-others-zulfa-mahendra-3.png" }'::JSONB,
    '{"do_not_hide": true, "public": false, "exclusive_domains": ["minimal.edu"]}'::JSONB
);

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
  "azure-ad",
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
  do_not_hide?: boolean; // default false, only relevant for public=false SSOs, which will be shown on the login/signup page directly
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
