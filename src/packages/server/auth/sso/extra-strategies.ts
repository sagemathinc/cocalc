/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Strategy as PassportStrategy } from "passport";

import { Strategy as SAMLStrategyNew } from "@node-saml/passport-saml";
import { Strategy as NextOAuth2 } from "@passport-next/passport-oauth2";
import { Strategy as ADStrategy } from "passport-activedirectory";
import { Strategy as AppleStrategy } from "passport-apple";
import { OIDCStrategy as AzureAdStrategy } from "passport-azure-ad";
import { Strategy as Gitlab2Strategy } from "passport-gitlab2";
import * as oauth from "passport-oauth"; // this is a wrapper containing version 1 and 2
import { Strategy as OidcStrategy } from "passport-openidconnect";
import { Strategy as OrcidStrategy } from "passport-orcid";
import { Strategy as SAMLStrategyOld } from "passport-saml";

import { unreachable } from "@cocalc/util/misc";
import { PassportTypes, PassportTypesList } from "./types";
import { getLogger } from "@cocalc/backend/logger";

const L = getLogger("server:auth:sso:extra-strategies");

export function getSAMLVariant(): "old" | "new" {
  const ret = process.env.COCALC_SSO_SAML === "new" ? "new" : "old";
  L.debug(`SAML variant: ${ret}`);
  return ret;
}

export function getExtraStrategyConstructor(
  type: PassportTypes
): typeof PassportStrategy | typeof SAMLStrategyNew | typeof SAMLStrategyOld {
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
      return getSAMLVariant() === "new" ? SAMLStrategyNew : SAMLStrategyOld;
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
