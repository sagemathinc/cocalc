/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Single source of truth for cookie categories. Anything that varies per
// category — vanilla-cookieconsent v3 runtime config, the snapshot shape we
// persist into accounts.other_settings, the labels in the account settings
// panel — derives from this list. Adding a new category (e.g. "marketing")
// means:
//
//   1. append an entry here with key + label + autoClearCookies as needed
//   2. bump COOKIE_CONSENT_REVISION so existing users get re-prompted
//
// Everything else falls into place automatically.

interface CookieItem {
  name: string | RegExp;
}

export interface CookieCategory {
  readonly key: string;
  // Short user-visible name (banner/preferences modal title + settings panel).
  readonly label: string;
  // Body copy for the preferences modal section. Plain text — kept short and
  // factual; longer explanation belongs in the admin-configurable banner text.
  readonly description: string;
  // True for cookies the user can't opt out of (e.g. session). v3 renders
  // these toggles as locked-on.
  readonly readOnly: boolean;
  // Default state on first visit, before the user has acknowledged.
  readonly defaultEnabled: boolean;
  // Cookies that vanilla-cookieconsent should erase when the user revokes
  // this category. autoClearCookies is on by default in v3, so listing the
  // names here is sufficient — runtime takes care of the actual removal.
  readonly autoClearCookies?: ReadonlyArray<CookieItem>;
}

export const COOKIE_CATEGORIES = [
  {
    key: "necessary",
    label: "Necessary cookies",
    description:
      "Required for sign-in and to keep your session active. These cookies cannot be turned off.",
    readOnly: true,
    defaultEnabled: true,
  },
  {
    key: "analytics",
    label: "Analytics cookies",
    description:
      "Third-party analytics that help us understand how the site is used.",
    readOnly: false,
    defaultEnabled: false,
    autoClearCookies: [
      { name: /^_ga/ }, // Google Analytics (gtag/GA4)
      { name: /^_gid/ }, // Google Analytics
      { name: "CC_ANA" }, // legacy CoCalc analytics cookie
    ],
  },
  {
    key: "usage",
    label: "Usage metrics",
    description:
      "First-party metrics (e.g. which buttons get clicked) recorded in our own database to help us improve the product.",
    readOnly: false,
    defaultEnabled: false,
  },
] as const satisfies ReadonlyArray<CookieCategory>;

export type CookieCategoryKey = (typeof COOKIE_CATEGORIES)[number]["key"];
