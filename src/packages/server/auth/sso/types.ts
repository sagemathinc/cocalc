/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Strategy as SAMLStrategyNew } from "@node-saml/passport-saml";
import { Router } from "express";
import { AuthenticateOptions, Strategy as PassportStrategy } from "passport";
import { Strategy as SAMLStrategyOld } from "passport-saml";
import { Strategy as TwitterStrategy } from "passport-twitter";
import { Strategy as GoogleStrategyOld } from "@passport-next/passport-google-oauth2";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as GithubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { PostgreSQL } from "@cocalc/database/postgres/types";
import type {
  LoginInfoDerivator,
  PassportTypes,
} from "@cocalc/database/settings/auth-sso-types";

export interface InitPassport {
  router: Router;
  database: PostgreSQL;
  host: string;
  cb: (err?) => void;
}

export interface PassportManagerOpts {
  router: Router;
  database: PostgreSQL;
  host: string;
}

export class TwitterWrapper extends TwitterStrategy {
  constructor(
    { clientID: consumerKey, clientSecret: consumerSecret, callbackURL },
    verify,
  ) {
    super({ consumerKey, consumerSecret, callbackURL }, verify);
  }
}

export type PassportStrategyConstructorType =
  | typeof PassportStrategy
  | typeof SAMLStrategyNew
  | typeof SAMLStrategyOld
  | typeof TwitterWrapper
  | typeof FacebookStrategy
  | typeof GithubStrategy
  | typeof GoogleStrategy
  | typeof GoogleStrategyOld;

export interface StrategyInstanceOpts {
  type: PassportTypes;
  opts: { [key: string]: any };
  userinfoURL: string | undefined;
  PassportStrategyConstructor: PassportStrategyConstructorType;
}

export interface StrategyConf {
  name: string; // our custom name
  type: PassportTypes; // e.g. "saml"
  PassportStrategyConstructor: PassportStrategyConstructorType;
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
