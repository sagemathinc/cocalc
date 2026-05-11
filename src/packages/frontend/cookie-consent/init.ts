/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// GDPR cookie consent banner shared between the SPA frontend and the Next.js
// landing pages. We use vanilla-cookieconsent v3 because it is framework
// agnostic — the same configuration object initialises the banner in both the
// SPA and the SSR-rendered Next.js app.
//
// Note: callers must `import "vanilla-cookieconsent/dist/cookieconsent.css"`
// themselves, alongside calling initCookieConsent. Next.js refuses global CSS
// imports from any file other than pages/_app.tsx, even transitively through
// an imported module — so the CSS import has to live directly in the entry.
// Helpers that don't need the CSS (e.g. the requireEssentialConsent gate used
// in sign-in/sign-up) live in ./index.

import { join } from "path";

import * as CookieConsent from "vanilla-cookieconsent";

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { markdown_to_html } from "@cocalc/frontend/markdown";

import { COOKIE_CATEGORIES, type CookieCategory } from "./categories";
import { COOKIE_CONSENT_REVISION } from "./index";
import { markBannerActive, markBannerDecidedDisabled } from "./state";
import {
  YOUTUBE_SECTION_BUTTON_ID,
  YOUTUBE_SECTION_CSS,
  YOUTUBE_SECTION_STATUS_ID,
  buildTranslation,
} from "./translations";
import {
  YOUTUBE_CONSENT_EVENT,
  grantYouTubeConsent,
  hasYouTubeConsent,
  revokeYouTubeConsent,
} from "./youtube";

function buildCategoriesConfig(): Record<string, CookieConsent.Category> {
  const out: Record<string, CookieConsent.Category> = {};
  for (const raw of COOKIE_CATEGORIES) {
    // Widen from `as const satisfies` narrowing so optional fields are visible.
    const c: CookieCategory = raw;
    const entry: CookieConsent.Category = {
      enabled: c.defaultEnabled,
      readOnly: c.readOnly,
    };
    if (c.autoClearCookies && c.autoClearCookies.length > 0) {
      entry.autoClear = {
        cookies: c.autoClearCookies.map((x) => ({ name: x.name })),
      };
    }
    out[c.key] = entry;
  }
  return out;
}

let initialized = false;

export interface InitOptions {
  enabled?: boolean;
  // Markdown body shown in the banner & preferences modal.
  textMarkdown?: string;
}

// We never pass disablePageInteraction here. v3 only honours that at init,
// so it would not survive client-side navigation between non-auth and auth
// routes. Force-consent mode is applied separately via enableForceConsent
// from ./index, which toggles the same `disable--interaction` class on
// <html> as v3's built-in option and can be flipped on route changes.
export function initCookieConsent({
  enabled,
  textMarkdown,
}: InitOptions): void {
  if (initialized) return;
  if (typeof window === "undefined") return;
  if (!enabled) {
    // Customize loaded with banner disabled — flip the "decided" flag so
    // gate helpers (hasEssentialConsent, useEssentialConsent) stop being
    // conservative and pass through.
    markBannerDecidedDisabled();
    return;
  }
  initialized = true;
  markBannerActive();

  const descHtml = markdown_to_html(textMarkdown?.trim() || "");
  const privacyUrl = join(appBasePath, "policies/privacy");
  const termsUrl = join(appBasePath, "policies/terms");

  try {
    const runResult: any = CookieConsent.run({
      revision: COOKIE_CONSENT_REVISION,
      guiOptions: {
        consentModal: {
          layout: "box inline",
          position: "bottom right",
          equalWeightButtons: true,
          flipButtons: false,
        },
        preferencesModal: {
          layout: "bar",
          position: "right",
          equalWeightButtons: true,
          flipButtons: false,
        },
      },
      categories: buildCategoriesConfig(),
      language: {
        default: "en",
        translations: {
          en: buildTranslation(descHtml, privacyUrl, termsUrl),
        },
      },
    });
    if (runResult && typeof runResult.catch === "function") {
      runResult.catch((err: unknown) =>
        console.error("cookie-consent: run rejected", err),
      );
    }
    injectYouTubeSectionStyles();
    wireYouTubePreferencesSection();
  } catch (err) {
    console.error("cookie-consent: run threw", err);
  }
}

// Mount the YouTube section stylesheet into <head>. v3 places our section
// description inside a <p>, which can't host a <style> child without the
// HTML parser auto-closing the paragraph. Putting the rules in <head>
// avoids that and applies them to every modal open.
function injectYouTubeSectionStyles(): void {
  if (typeof document === "undefined") return;
  const id = "cocalc-yt-styles";
  if (document.getElementById(id) != null) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = YOUTUBE_SECTION_CSS;
  document.head.appendChild(style);
}

// Hook up the "Embedded videos" section the translations file injected into
// the preferences modal. v3 only renders that HTML — it doesn't know about
// our parallel YouTube consent cookie — so we re-populate the status badge
// and bind the toggle checkbox each time the modal opens, and refresh
// state whenever the cookie changes (e.g. from a click-to-load gate on the
// landing page while the modal is already open).
function wireYouTubePreferencesSection(): void {
  if (typeof window === "undefined") return;
  const refresh = () => {
    const status = document.getElementById(YOUTUBE_SECTION_STATUS_ID);
    const toggle = document.getElementById(
      YOUTUBE_SECTION_BUTTON_ID,
    ) as HTMLInputElement | null;
    if (status == null || toggle == null) return;
    const granted = hasYouTubeConsent();
    status.textContent = granted ? "Allowed" : "Blocked";
    status.classList.toggle("cocalc-yt-status--on", granted);
    status.classList.toggle("cocalc-yt-status--off", !granted);
    if (toggle.checked !== granted) toggle.checked = granted;
  };
  // v3 fires cc:onModalShow when either modal opens; we don't try to
  // filter to just the preferences modal because the elements are scoped
  // by id and absent when the consent modal is open.
  window.addEventListener("cc:onModalShow", refresh);
  window.addEventListener(YOUTUBE_CONSENT_EVENT, refresh);
  // Delegated change handler — the checkbox is re-rendered each time v3
  // mounts the preferences modal, so binding directly on the element
  // would miss subsequent opens.
  document.addEventListener("change", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id !== YOUTUBE_SECTION_BUTTON_ID) return;
    if (target.checked) {
      grantYouTubeConsent();
    } else {
      revokeYouTubeConsent();
    }
  });
}

