/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import { Strategy as SAMLStrategyOld } from "passport-saml";

import { getLogger } from "@cocalc/backend/logger";
import type { PassportTypes } from "@cocalc/database/settings/auth-sso-types";
import { PassportTypesList } from "@cocalc/database/settings/auth-sso-types";
import { unreachable } from "@cocalc/util/misc";
import type { PassportStrategyConstructorType } from "./types";

const L = getLogger("server:auth:sso:extra-strategies");

// by default, we keep the old variant, which has been in use for years
// the new one has been added as a non-standard variant
// https://github.com/sagemathinc/cocalc/pull/6572
// TODO: some day in the future switch over to the new variant
// NOTE: this only affects the "saml" type. You can also be explicit by setting type to saml-v3 or saml-v4
export function getSAMLVariant(): "old" | "new" {
  const ret = process.env.COCALC_SSO_SAML === "new" ? "new" : "old";
  L.debug(`SAML variant: ${ret}`);
  return ret;
}

export function getExtraStrategyConstructor(
  type: PassportTypes,
): PassportStrategyConstructorType {
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
    case "saml-v3":
      return SAMLStrategyOld;
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
