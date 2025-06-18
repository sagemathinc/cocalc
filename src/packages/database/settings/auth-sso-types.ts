/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PostgreSQL } from "@cocalc/database/postgres/types";

export interface PassportLoginOpts {
  passports: { [k: string]: PassportStrategyDB };
  database: PostgreSQL;
  strategyName: string;
  profile: any; // complex object
  id: string; // id is required. e.g. take the email address – see create_passport in postgres-server-queries.coffee
  first_name?: string;
  last_name?: string;
  full_name?: string;
  emails?: string[];
  req: any;
  res: any;
  update_on_login: boolean; // passed down from StrategyConf, default false
  cookie_ttl_s?: number; // how long the remember_me cookied lasts (default is a month or so)
  host: string;
  site_url: string;
  cb?: (err) => void;
}

// passport_login state
export interface PassportLoginLocals {
  account_id: string | undefined;
  email_address: string | undefined;
  new_account_created: boolean;
  has_valid_remember_me: boolean;
  target: string;
  cookies: any;
  remember_me_cookie: string;
  get_api_key: string;
  action: "regenerate" | "get" | undefined;
  api_key;
}

// maps the full profile object to a string or list of strings (e.g. "first_name")
export type LoginInfoDerivator<T> = (profile: any) => T;

export type LoginInfoKeys = "id" | "first_name" | "last_name" | "emails";

// google, facebook, etc ... are not included, they're hardcoded
export const PassportTypesList = [
  "email", // special case, always included by default, not a passport strategy
  "activedirectory",
  "apple",
  "azuread",
  "gitlab2",
  "oauth1",
  "oauth2",
  "oauth2next",
  "oidc",
  "orcid",
  "saml",
  "saml-v3",
  "saml-v4",
  // the 4 types for google, twitter, github and facebook are not included here – they're hardcoded special cases
] as const;

export type PassportTypes = (typeof PassportTypesList)[number];

export function isSAML(type: PassportTypes): boolean {
  return type === "saml" || type === "saml-v3" || type === "saml-v4";
}

// the OAuth2 strategies
export function isOAuth2(type: PassportTypes): boolean {
  return type === "oauth2" || type === "oauth2next";
}

export type PassportLoginInfo = { [key in LoginInfoKeys]?: string };

/**
 * To confgure a passport strategy, the "type" field is required.
 * It associates these config parameters with a strategy constructor from one of the passport.js strategies.
 * The remaining fields, except for type, clientID, clientSecret, and callbackURL, userinfoURL, login_info are passed to that constructor.
 * Additionally, there are default values for some of the fields, e.g. for the SAML2.0 strategy.
 * Please check the hub/auth.ts file for more details.
 *
 * Regarding the userinfoURL, this is used by OAuth2 to get the profile.
 *
 * The "login_info" field is a mapping from "cocalc" profile fields, that end up in the DB,
 * to the entries in the generated profile object. The DB entry can only be a string and
 * processing is done by using the "dot-object" npm library.
 * What should be provided is a mapping like that (the default for OAuth2), which in particular provides a unique id (a number or email address):
 * {
 *   id: "id",
 *   first_name: "name.givenName",
 *   last_name: "name.familyName",
 *   emails: "emails[0].value",
 * }
 * You can to customize the separator of dot-object, e.g. to process keys with dots, add a "_sep: string" entry.
 */
export interface PassportStrategyDBConfig {
  type: PassportTypes;
  clientID?: string; // Google, Twitter, ... and OAuth2
  clientSecret?: string; // Google, Twitter, ... and OAuth2
  authorizationURL?: string; // OAuth2
  tokenURL?: string; // --*--
  userinfoURL?: string; // OAuth2, to get a profile
  login_info?: PassportLoginInfo; // extracting fields from the returned profile, uses "dot-object", e.g. { emails: "emails[0].value" }
  auth_opts?: { [key: string]: string }; // auth options, typed as AuthenticateOptions but OAuth2 has one which isn't part of the type – hence we keep it general
  cert?: string; // passport-saml<5
  idpCert?: string; // passport-saml>=5  https://github.com/node-saml/node-saml/pull/343
}

/**
 * The "info" column contains information, which is relevant to CoCalc's side of SSO strategies.
 * - public (default true): if false, the strategy is not shown prominently, but moved to the dedicated /sso/... pages.
 * Set this to false for all "institutional" SSO connections. (public would be Google, Twitter, etc. where anyone can have an account)
 * - do_not_hide: if public is false and do_not_hide is true, the strategy is still shown prominently.
 * - exclusive_domains: a list of domain extensions, matching also subdomains, e.g. ["example.com", "example.org"]
 * would match foo@example.com and bar@baz.example.org
 * The ultimate intention is that users with such email addresses have to go through that authentication mechanism.
 * They're also prevented from linking with other passports, changing email address, or unlinking that passport from their account.
 * That way, the organization behind that SSO mechanism has full control over the user's account.
 * - display: The string that's presented to the user as the name of that SSO strategy.
 * - description: A longer description of the strategy, could be markdown, shown on the dedicated /sso/... pages.
 * - icon: A URL to an icon
 * - disabled: if true, this is ignored during the initialization
 * - update_on_login: if true, the user's profile is updated on login (first and last name, not email) and NOT by the user.
 * - cookie_ttl_s: how long the remember_me cookied lasts (default is a month or so).
 * This could be set to a much shorter period to force users more frequently to re-login.
 */
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
  strategy: string; // must be unique
  conf: PassportStrategyDBConfig;
  info?: PassportStrategyDBInfo;
}

export interface UserProfileCallbackOpts {
  strategy_instance: any;
  userinfoURL: string;
  L2: Function;
  type: PassportTypes;
}
