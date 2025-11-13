/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Authentication and SSO related utility functions or data shared between all packages

import { capitalize } from "@cocalc/util/misc";

export function ssoDispayedName({
  display,
  name, // name of strategy
}: {
  display?: string;
  name?: string;
}) {
  return display ?? (name === "github" ? "GitHub" : capitalize(name));
}

export const MAX_PASSWORD_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;
export const MIN_PASSWORD_STRENGTH = 2; // zxcvbn score must be > 2 (so 3 or 4)
