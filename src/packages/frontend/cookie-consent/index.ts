/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Public helpers shared by sign-in/sign-up flows and analytics gating. This
// module deliberately does NOT import the vanilla-cookieconsent CSS — that
// happens in ./init, which is the only entry point allowed to do a global CSS
// import (Next.js restricts global CSS imports to pages/_app.tsx).

import { useEffect, useState } from "react";

import * as CookieConsent from "vanilla-cookieconsent";

import { COOKIE_CATEGORIES, type CookieCategoryKey } from "./categories";
import { BANNER_STATE_EVENT, isBannerActive, isBannerDecided } from "./state";

export { COOKIE_CATEGORIES };
export type { CookieCategoryKey };

// Bump this if the cookie categories or banner text change in a way that
// invalidates prior consent. vanilla-cookieconsent will re-prompt the user.
export const COOKIE_CONSENT_REVISION = 1;

// Snapshot of the user's consent we persist in account.other_settings. Kept
// minimal on purpose: the browser cookie is authoritative for the session;
// this record is for audit/UI display.
//
// Per-category booleans are derived from COOKIE_CATEGORIES rather than
// hand-listed — adding a new category in categories.ts automatically
// extends this type. Stored as individual fields rather than an array
// because the immutable.js layer that backs other_settings turns arrays
// into objects with numeric keys when round-tripping through JSONB.
export type ConsentSnapshot = Record<CookieCategoryKey, boolean> & {
  timestamp: string; // ISO 8601, last time the user changed their choice
  revision: number;
};

// True once the user has acted on the banner (accepted necessary or all).
// Until then we block sign-up/sign-in. Returns:
//   * false while customize is still loading (we don't yet know whether the
//     banner will activate — be conservative so modals don't render on top
//     of a banner that's about to appear)
//   * true if the admin has the banner disabled (nothing to acknowledge)
//   * v3's validConsent() if the banner is active
export function hasEssentialConsent(): boolean {
  if (typeof window === "undefined") return false;
  if (!isBannerDecided()) return false;
  if (!isBannerActive()) return true;
  try {
    return CookieConsent.validConsent();
  } catch {
    return false;
  }
}

// Generic per-category consent check. Returns false if the v3 runtime
// isn't running (banner admin-disabled or not yet initialised) — callers
// that want "passthrough when banner is off" should check
// `cookie_banner_enabled` from customize separately, mirroring the pattern
// in `customize.tsx#init_analytics`.
export function hasCategoryConsent(key: CookieCategoryKey): boolean {
  if (typeof window === "undefined") return false;
  try {
    return CookieConsent.acceptedCategory(key);
  } catch {
    return false;
  }
}

// Backwards-compatible alias for the analytics category. Existing callers
// (next/components/analytics, frontend/customize, sign-in-hooks) keep their
// import unchanged.
export function hasTrackingConsent(): boolean {
  return hasCategoryConsent("analytics");
}

// Open the consent modal for first-time consent (e.g. when user clicks
// sign-in without having accepted yet).
export function showConsentModal(): void {
  if (typeof window === "undefined") return;
  try {
    CookieConsent.show(true);
  } catch {
    // banner not initialised — nothing to show
  }
}

// Force-consent fallback for the SPA: an SSO callback can drop a logged-in
// user on /app without ever passing through the auth-page overlay. Once the
// account is loaded and we see the user has no valid consent, apply the same
// dimmed-overlay treatment manually (vanilla-cookieconsent's
// `disablePageInteraction` is config-time only; we replicate it by toggling
// the `disable--interaction` class on <html>, which the v3 stylesheet hooks
// into for the backdrop and scroll-lock).
//
// Returns a cleanup function. The class is also auto-removed when the user
// makes a choice (cc:onConsent / cc:onChange), so this is mostly belt &
// braces — callers should still invoke the returned cleanup on unmount.
export function enableForceConsent(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!isBannerActive()) return () => {}; // banner disabled by admin
  if (hasEssentialConsent()) return () => {}; // nothing to enforce
  const html = document.documentElement;
  html.classList.add("disable--interaction");
  try {
    CookieConsent.show(true);
  } catch {
    /* banner runtime not ready yet — class will still dim the page */
  }
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    html.classList.remove("disable--interaction");
    window.removeEventListener("cc:onConsent", remove);
    window.removeEventListener("cc:onChange", remove);
  };
  window.addEventListener("cc:onConsent", remove);
  window.addEventListener("cc:onChange", remove);
  return remove;
}

// Open the preferences modal so a user can change their choice.
export function showPreferences(): void {
  if (typeof window === "undefined") return;
  try {
    CookieConsent.showPreferences();
  } catch {
    // banner not initialised
  }
}

// Returns true if the user can proceed (essential consent already given, or
// banner not enabled), or false after surfacing the consent modal so the user
// can grant it.
export function requireEssentialConsent(): boolean {
  if (hasEssentialConsent()) return true;
  showConsentModal();
  return false;
}

// Restore the browser cc_cookie from a previously-saved snapshot (e.g. from
// accounts.other_settings.cookie_consent). Used to skip the banner for
// signed-in users who have cleared cookies but already gave consent in
// their account — the consent record on the server stands as proof of
// approval, the browser cookie is just a runtime artifact.
//
// MUST be called BEFORE initCookieConsent / CookieConsent.run(), since v3
// reads the cookie once during run(). Returns true if a cookie was written,
// false if anything blocked the restore (no snapshot, revision mismatch,
// browser cookie already present, etc.).
export function restoreConsentCookieFromSnapshot(
  snap: ConsentSnapshot | null,
): boolean {
  if (typeof document === "undefined") return false;
  if (snap == null) return false;
  // Don't trample an existing cookie — browser is authoritative for the
  // current session.
  if (document.cookie.split(";").some((c) => c.trim().startsWith("cc_cookie=")))
    return false;
  // Re-prompt if the saved consent is for an older revision (categories or
  // text changed materially since the user last decided).
  if (snap.revision !== COOKIE_CONSENT_REVISION) return false;

  const categories: string[] = [];
  const services: Record<string, string[]> = {};
  for (const c of COOKIE_CATEGORIES) {
    services[c.key] = [];
    if ((snap as Record<string, unknown>)[c.key]) categories.push(c.key);
  }
  // Necessary is always-on; ensure it's listed even if the snapshot somehow
  // omits it.
  if (!categories.includes("necessary")) categories.push("necessary");

  const timestamp = snap.timestamp || new Date().toISOString();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const value = {
    categories,
    revision: snap.revision,
    data: null,
    consentTimestamp: timestamp,
    consentId: cryptoRandomId(),
    services,
    languageCode: "en",
    lastConsentTimestamp: timestamp,
    expirationTime: Date.now() + oneYearMs,
  };
  document.cookie =
    "cc_cookie=" +
    encodeURIComponent(JSON.stringify(value)) +
    `; path=/; max-age=${oneYearMs / 1000}; SameSite=Lax`;
  return true;
}

function cryptoRandomId(): string {
  // Best-effort UUID-ish identifier for cc_cookie.consentId. The DB record
  // is the authoritative consent log; this id is just v3's internal handle.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Read the current consent state from vanilla-cookieconsent's cookie. Returns
// null if the user has not yet acted on the banner.
export function getConsentSnapshot(): ConsentSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    if (!CookieConsent.validConsent()) return null;
    const cookie = CookieConsent.getCookie();
    if (cookie == null) return null;
    const accepted = new Set<string>(cookie.categories ?? []);
    const snap = {
      timestamp:
        cookie.lastConsentTimestamp ?? cookie.consentTimestamp ?? "",
      revision: cookie.revision ?? 0,
    } as ConsentSnapshot;
    for (const c of COOKIE_CATEGORIES) {
      (snap as Record<string, boolean | string | number>)[c.key] =
        accepted.has(c.key);
    }
    return snap;
  } catch {
    return null;
  }
}

type Unsubscribe = () => void;

// Subscribe to consent changes. Fires immediately with the current snapshot
// (or null if the user hasn't acted yet) and again on every cc:onConsent /
// cc:onChange event. Callers receive null when there's no valid consent —
// most callers should ignore those events rather than treat them as "consent
// was revoked"; the cc_cookie can expire naturally after a year. Persistence-
// style callers should skip null; UI-style callers should render the
// absence-of-consent state.
//
// Note: vanilla-cookieconsent fires cc:onChange synchronously while it's
// still flushing the new cookie value, so reading getConsentSnapshot() at
// event time can return a stale snapshot (or briefly null). We call the
// handler again on the next macrotask so callers always settle on the
// post-toggle state.
export function onConsentChange(
  cb: (snap: ConsentSnapshot | null) => void,
): Unsubscribe {
  if (typeof window === "undefined") return () => {};
  let timer: number | undefined;
  const handler = () => {
    cb(getConsentSnapshot());
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => cb(getConsentSnapshot()), 0);
  };
  window.addEventListener("cc:onConsent", handler);
  window.addEventListener("cc:onChange", handler);
  window.addEventListener(BANNER_STATE_EVENT, handler);
  // Fire once for the current state.
  handler();
  return () => {
    window.removeEventListener("cc:onConsent", handler);
    window.removeEventListener("cc:onChange", handler);
    window.removeEventListener(BANNER_STATE_EVENT, handler);
    if (timer != null) window.clearTimeout(timer);
  };
}

// React hook: re-renders when essential consent state flips. Used to disable
// sign-in / sign-up submit buttons until the user acknowledges the banner.
//
// First render returns false to avoid a Next.js hydration mismatch (the
// server can't read the cc_cookie). The synchronous useEffect-on-mount call
// then reconciles to the real value before the next paint, so a returning
// user with valid consent never sees the "Acknowledge cookie banner to
// continue" label flash. We also subscribe to BANNER_STATE_EVENT so we
// re-render when initCookieConsent decides whether the banner activates —
// otherwise the hook could be stuck at "consented" while customize is
// loading, since the inactive-banner branch returns true.
export function useEssentialConsent(): boolean {
  const [accepted, setAccepted] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setAccepted(hasEssentialConsent());
    update(); // sync reconcile post-hydration
    window.addEventListener("cc:onConsent", update);
    window.addEventListener("cc:onChange", update);
    window.addEventListener(BANNER_STATE_EVENT, update);
    return () => {
      window.removeEventListener("cc:onConsent", update);
      window.removeEventListener("cc:onChange", update);
      window.removeEventListener(BANNER_STATE_EVENT, update);
    };
  }, []);
  return accepted;
}
