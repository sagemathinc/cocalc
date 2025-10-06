/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

// documentation pages
export const DOC_AI = "https://doc.cocalc.com/ai.html";

export const R_IDE = "R Studio";

// Default font size for account settings and UI elements
export const DEFAULT_FONT_SIZE = 14;
// Icon unicode character for dark mode toggle (◑ - circle with right half black)
export const DARK_MODE_ICON = 0x25d1;
