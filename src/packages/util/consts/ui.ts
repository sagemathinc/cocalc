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

// Default font size for account settings and UI elements
export const DEFAULT_FONT_SIZE = 14;

// Icon unicode character for dark mode toggle (☽ - first quarter moon)
export const DARK_MODE_ICON = 0x263d;

// Icon unicode character for accessibility (♿ - wheelchair symbol)
export const ACCESSIBILITY_ICON = 0x267f;

// Keyword for accessibility settings, in account settings and URL query parameter
export const A11Y = "accessibility";

// Icon unicode characters for auto-sync arrows in LaTeX editor
export const SYNC_FORWARD_ICON = 0x21a6; // ↦ - rightwards arrow $mapto$
export const SYNC_INVERSE_ICON = 0x21a4; // ↤ - leftwards arrow $mapfrom$
