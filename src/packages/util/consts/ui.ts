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

// How we call Posit's RStudio (rserver) IDE.  They trademark "RStudio"
// see https://posit.co/about/trademark-guidelines/
// and a core principle of our company is to be as respectful as possible
// to all legal requirements. We thus don't use their trademark
// anywhere in our frontend.
export const R_IDE = "R IDE";

// Icon unicode character for dark mode toggle (◑ - circle with right half black)
export const DARK_MODE_ICON = 0x25d1;
