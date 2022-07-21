/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AuthenticateOptions } from "passport";
import { Router } from "express";
import { PostgreSQL } from "@cocalc/database/postgres/types";

export interface InitPassport {
  router: Router;
  database: PostgreSQL;
  host: string;
  cb: (err?) => void;
}

export interface PassportLogin {
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
  host?: any;
  cb?: (err) => void;
}

export interface PassportManagerOpts {
  router: Router;
  database: PostgreSQL;
  host: string;
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
  api_key: string | undefined;
}

// this error is used to signal that the user has done something wrong (in a general sense) and not the code or returned data by itself is buggy.
// this is used to improve the feedback sent back to the user if there is a problem...
export class PassportLoginError extends Error {
  constructor(message, error?) {
    super(message, { cause: error });
    this.name = "PassportLoginError";
  }
}

// maps the full profile object to a string or list of strings (e.g. "first_name")
export type LoginInfoDerivator<T> = (profile: any) => T;

export interface StrategyConf {
  name: string; // our custom name
  type: PassportTypes; // e.g. "saml"
  PassportStrategyConstructor: any;
  extra_opts?: {
    enableProof?: boolean; // facebook
    profileFields?: string[]; // facebook
    includeEmail?: boolean; // twitter
  };
  auth_opts?: AuthenticateOptions;
  // return type has to partially fit with passport_login
  login_info: {
    id: string | LoginInfoDerivator<string>; // id is required!
    first_name?: string | LoginInfoDerivator<string>;
    last_name?: string | LoginInfoDerivator<string>;
    full_name?: string | LoginInfoDerivator<string>;
    emails?: string | LoginInfoDerivator<string[]>;
  };
  userinfoURL?: string; // OAuth2, to get a profile
  update_on_login?: boolean; // if true, update the user's profile on login
  cookie_ttl_s?: number; // how long the remember_me cookied lasts (default is a month or so)
}

export type LoginInfoKeys = "id" | "first_name" | "last_name" | "emails";

// google, facebook, etc ... are not included, they're hardcoded
export const PassportTypesList = [
  "email", // special case, always included by default, not a passport strategy
  "activedirectory",
  "oauth1",
  "oauth2",
  "oauth2next",
  "orcid",
  "saml",
  "gitlab2",
  "apple",
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

export interface StrategyInstanceOpts {
  type: PassportTypes;
  opts: { [key: string]: any };
  userinfoURL: string | undefined;
  PassportStrategyConstructor: new (options, verify) => any;
}

export interface UserProfileCallbackOpts {
  strategy_instance: any;
  userinfoURL: string;
  L2: Function;
  type: PassportTypes;
}
