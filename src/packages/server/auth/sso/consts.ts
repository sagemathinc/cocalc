/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// various constants related to SSO authentication

import base_path from "@cocalc/backend/base-path";
import { PassportLoginInfo } from "@cocalc/database/settings/auth-sso-types";

// This is the default derivation of user/profile fields.
// Overwrite them via the configuration's login_info field.
// Don't change it nilly-willy, since e.g. parse_openid_profile transforms
// data to a profile, which will be processed by this description.
export const DEFAULT_LOGIN_INFO: Required<PassportLoginInfo> = {
  id: "id",
  first_name: "name.givenName",
  last_name: "name.familyName",
  emails: "emails[0].value",
} as const;

// see next/pages/auth/ROUTING.md for more informatino
export const BLACKLISTED_STRATEGIES = [
  "sign-in",
  "sign-up",
  "try",
  "verify",
  "password-reset",
] as const;

export const SSO_API_KEY_COOKIE_NAME = base_path + "get_api_key";
