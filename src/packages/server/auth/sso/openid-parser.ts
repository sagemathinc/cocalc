/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { firstLetterUppercase } from "@cocalc/util/misc";
import { Profile } from "passport";
import { PassportTypes } from "@cocalc/database/settings/auth-sso-types";

// generalized OpenID (OAuth2) profile parser for the "userinfo" endpoint
// the returned structure matches passport.js's conventions and also has
// to match what's defined in DEFAULT_LOGIN_INFO
export function parseOpenIdProfile(
  type: PassportTypes,
  json: any
): Profile & { _json: any } {
  // it's a convention to also store the raw json in _json
  // we don't store the "_raw" field (unprocessed json), since it is redundant
  const profile: Profile & { _json: any } = {
    provider: type,
    id: json.sub || json.id || json.user_id,
    displayName: json.displayName || json.name,
    _json: json,
  };
  if (json.family_name || json.given_name) {
    profile.name = {
      givenName: json.given_name,
      familyName: json.family_name,
    };
  } else if (json.realname) {
    // realname usually have form  «FirstName MiddleName… LastName»
    const [first, ...last] = json.realname.split(" ");
    profile.name = {
      givenName: first,
      familyName: last.join(" "), // Or we should get last[-1]?
    };
  } else if (json.email) {
    // no name? we use the email address
    // don't include dots, because our "spam protection" rejects domain-like patterns
    const emailacc = json.email
      .split("@")[0]
      .split(".")
      .map(firstLetterUppercase);
    if (emailacc.length > 1) {
      const [first, ...last] = emailacc;
      profile.name = {
        givenName: first,
        familyName: last.join(" "),
      };
    } else {
      profile.name = {
        givenName: "",
        familyName: emailacc.join(" "),
      };
    }
  }

  if (json.email) {
    // see DEFAULT_LOGIN_INFO
    profile.emails = [{ value: json.email }];
  }

  return profile;
}
