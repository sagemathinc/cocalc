/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AuthenticateOptions } from "passport";
import { Router } from "express";
import { PostgreSQL } from "@cocalc/database/postgres/types";
import type {
  PassportTypes,
  LoginInfoDerivator,
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
