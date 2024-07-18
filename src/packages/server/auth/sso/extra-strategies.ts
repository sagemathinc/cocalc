/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Strategy as SAMLStrategyNew } from "@node-saml/passport-saml";
import { Strategy as NextOAuth2 } from "@passport-next/passport-oauth2";
import { Strategy as ADStrategy } from "passport-activedirectory";
import { Strategy as AppleStrategy } from "passport-apple";
import { OIDCStrategy as AzureAdStrategy } from "passport-azure-ad";
import { Strategy as Gitlab2Strategy } from "passport-gitlab2";
import * as oauth from "passport-oauth"; // this is a wrapper containing version 1 and 2
import { Strategy as OidcStrategy } from "passport-openidconnect";
import { Strategy as OrcidStrategy } from "passport-orcid";

import { getLogger } from "@cocalc/backend/logger";
import type { PassportTypes } from "@cocalc/database/settings/auth-sso-types";
import { PassportTypesList } from "@cocalc/database/settings/auth-sso-types";
import { unreachable } from "@cocalc/util/misc";
import type { PassportStrategyConstructorType } from "./types";

const L = getLogger("server:auth:sso:extra-strategies");

export function getExtraStrategyConstructor(
  type: PassportTypes,
): PassportStrategyConstructorType {
  // LDAP via passport-ldapauth: https://github.com/vesse/passport-ldapauth#readme
  // OAuth2 via @passport-next/passport-oauth2: https://github.com/passport-next/passport-oauth2#readme
  // ORCID via passport-orcid: https://github.com/hubgit/passport-orcid#readme
  if (!PassportTypesList.includes(type)) {
    throw Error(`hub/auth: unknown extra strategy "${type}"`);
  }

  // user the L logger to warn if using saml-v3. It is removed and uses the new variant now.
  if (type === "saml-v3") {
    L.warn(
      `The saml-v3 type has been removed. Please use saml or saml-v4 instead. It uses @node-saml/passport-saml now`,
    );
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
    case "saml-v3":
    case "saml-v4":
      return SAMLStrategyNew;
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
