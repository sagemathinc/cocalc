/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Stand-alone "consent for embedded YouTube" flag. Kept separate from the
// vanilla-cookieconsent v3 banner state on purpose: accepting a YouTube
// embed must not mark the main banner as "decided", otherwise the
// force-consent overlay on sign-up / SSO launch would stop triggering for
// a visitor who only clicked a video on the landing page.
//
// The preferences modal still surfaces this consent (see translations.ts +
// init.ts) so users can review and revoke it alongside the categories;
// internally that UI just reads/writes the dedicated cookie below.

import { useEffect, useState } from "react";

const YT_COOKIE = "cocalc_youtube_consent";
const ONE_YEAR_S = 365 * 24 * 60 * 60;
export const YOUTUBE_CONSENT_EVENT = "cocalc:youtube-consent";

export function hasYouTubeConsent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim() === `${YT_COOKIE}=1`);
}

function emitChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(YOUTUBE_CONSENT_EVENT));
  }
}

export function grantYouTubeConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${YT_COOKIE}=1; path=/; max-age=${ONE_YEAR_S}; SameSite=Lax`;
  emitChange();
}

export function revokeYouTubeConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${YT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  emitChange();
}

// React hook: re-renders when YouTube consent state flips. First render
// returns false to avoid a Next.js hydration mismatch (the server can't
// read document.cookie); useEffect reconciles to the real value.
export function useYouTubeConsent(): boolean {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    const update = () => setGranted(hasYouTubeConsent());
    update();
    window.addEventListener(YOUTUBE_CONSENT_EVENT, update);
    return () =>
      window.removeEventListener(YOUTUBE_CONSENT_EVENT, update);
  }, []);
  return granted;
}
