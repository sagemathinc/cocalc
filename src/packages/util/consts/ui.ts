/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/**
 * User Interface specific constants
 */

// icon name used for shared files, only accessible for authenticated users
export const SHARE_AUTHENTICATED_ICON = "user";
export const SHARE_AUTHENTICATED_EXPLANATION =
  "only visible to those who are signed in";
// boolean flags for various shared files visibility modes
export const SHARE_FLAGS = {
  LISTED: { unlisted: false, disabled: false, authenticated: false }, // aka PUBLIC
  UNLISTED: { unlisted: true, disabled: false, authenticated: false },
  DISABLED: { unlisted: false, disabled: true, authenticated: false }, // aka PRIVATE
  AUTHENTICATED: { unlisted: false, disabled: false, authenticated: true },
} as const;
