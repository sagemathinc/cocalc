/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Strategy as PassportStrategy } from "passport";

import { unreachable } from "@cocalc/util/misc";
import { Strategy as NextOAuth2 } from "@passport-next/passport-oauth2";
import { Strategy as ADStrategy } from "passport-activedirectory";
import { Strategy as AppleStrategy } from "passport-apple";
import { Strategy as Gitlab2Strategy } from "passport-gitlab2";
// this is a wrapper containing version 1 and 2
import { OIDCStrategy as AzureAdStrategy } from "passport-azure-ad";
import * as oauth from "passport-oauth";
import { Strategy as OidcStrategy } from "passport-openidconnect";
import { Strategy as OrcidStrategy } from "passport-orcid";
import { Strategy as SAMLStrategy } from "passport-saml";
import { PassportTypes, PassportTypesList } from "./types";

export function getExtraStrategyConstructor(
  type: PassportTypes
): typeof PassportStrategy | typeof SAMLStrategy {
  // LDAP via passport-ldapauth: https://github.com/vesse/passport-ldapauth#readme
  // OAuth2 via @passport-next/passport-oauth2: https://github.com/passport-next/passport-oauth2#readme
  // ORCID via passport-orcid: https://github.com/hubgit/passport-orcid#readme
  if (!PassportTypesList.includes(type)) {
    throw Error(`hub/auth: unknown extra strategy "${type}"`);
  }
  switch (type) {
    case "oauth1":
      return oauth.OAuthStrategy;
    case "oauth2":
      return oauth.OAuth2Strategy;
    case "oauth2next":
      return NextOAuth2;
    case "orcid":
      return OrcidStrategy;
    case "saml":
      return SAMLStrategy;
    case "oidc":
      return OidcStrategy;
    case "azuread":
      return AzureAdStrategy;
    case "activedirectory":
      return ADStrategy;
    case "gitlab2":
      return Gitlab2Strategy;
    case "apple":
      return AppleStrategy;
    case "email":
      throw new Error("email is a special case, not a strategy");
    default:
      unreachable(type);
  }
  throw new Error(`type ${type} not implemented`);
}
