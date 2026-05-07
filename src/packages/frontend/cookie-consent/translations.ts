/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Translation } from "vanilla-cookieconsent";

import { COOKIE_CATEGORIES } from "./categories";

// English-only for the first version. The rest of CoCalc uses simplelocalize +
// JSON files; integrating the cookie banner with that pipeline is deferred to
// a follow-up PR. The vanilla-cookieconsent `autoDetect: 'browser'` setting
// still works — every locale just falls back to the `en` translation here.

export function buildTranslation(
  descHtml: string,
  privacyUrl: string,
  termsUrl: string,
): Translation {
  const footerLinks = `<a href="${privacyUrl}" target="_blank" rel="noopener noreferrer">Privacy policy</a>\n<a href="${termsUrl}" target="_blank" rel="noopener noreferrer">Terms of service</a>`;
  // The preferences modal has no built-in footer slot in v3, so we append the
  // policy links to the lead-in description as a small paragraph.
  const prefsLead = `${descHtml}\n<p style="margin-top: 0.75em; font-size: 0.9em;">${footerLinks.replace("\n", " · ")}</p>`;
  // Per-category sections derive from COOKIE_CATEGORIES, so adding a new
  // category there automatically adds it to the preferences modal too.
  const categorySections = COOKIE_CATEGORIES.map((c) => ({
    title: c.label,
    description: c.description,
    linkedCategory: c.key,
  }));
  // Embedded YouTube videos use a separate consent flag (see
  // cookie-consent/youtube.ts) so that accepting a video does not mark the
  // main banner as decided. We still surface it in the preferences modal
  // so users can review/revoke it alongside the v3 categories. The button
  // is wired up by init.ts on `cc:onModalShow`.
  const youtubeSection = {
    title: "Embedded videos",
    description: buildYouTubeSectionHtml(),
  };
  return {
    consentModal: {
      title: "We value your privacy",
      description: descHtml,
      acceptAllBtn: "Accept all",
      acceptNecessaryBtn: "Necessary only",
      showPreferencesBtn: "Manage preferences",
      footer: footerLinks,
    },
    preferencesModal: {
      title: "Cookie preferences",
      acceptAllBtn: "Accept all",
      acceptNecessaryBtn: "Necessary only",
      savePreferencesBtn: "Save preferences",
      closeIconLabel: "Close",
      sections: [
        { description: prefsLead },
        ...categorySections,
        youtubeSection,
      ],
    },
  };
}

// Container HTML for the "Embedded videos" preferences section. The
// toggle state and status badge are filled in at modal-open time by
// init.ts so they reflect the current cookie state without our having to
// re-render the v3 modal config.
//
// The styling here mimics v3's own per-category section so the YouTube
// row visually slots in alongside Necessary / Analytics / Usage even
// though it isn't backed by a real v3 category. Scoped class names
// (`cocalc-yt-*`) avoid colliding with v3's `pm__` namespace.
export const YOUTUBE_SECTION_STATUS_ID = "cocalc-yt-status";
export const YOUTUBE_SECTION_TOGGLE_ID = "cocalc-yt-toggle";
// Kept as an alias so init.ts doesn't have to know which DOM element it
// is actually toggling (we switched from a <button> to a checkbox).
export const YOUTUBE_SECTION_BUTTON_ID = YOUTUBE_SECTION_TOGGLE_ID;

// CSS for the YouTube section. Three constraints conspire here:
//
//  1. v3 injects `section.description` via innerHTML into a <p>, so block
//     children (<div>, <style>) get ejected by the HTML parser. We use
//     only inline elements (<span>/<label>) below.
//  2. v3's stylesheet has a top-of-file rule
//       `#cc-main :before, #cc-main span, #cc-main input ... { all: unset }`
//     which carries the specificity of an id selector. Plain class
//     selectors lose to it, so every rule below is scoped under
//     `#cc-main` to match and source-order-override the reset.
//  3. The stylesheet is mounted into <head> by init.ts so it works
//     regardless of where in the cookie-consent modal the markup ends up.
export const YOUTUBE_SECTION_CSS = `
#cc-main .cocalc-yt-card {
  display: inline-flex;
  align-items: center;
  gap: 1em;
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.75em;
  padding: 0.75em 1em;
  border: 1px solid var(--cc-toggle-border-color, #d1d5db);
  border-radius: 0.5em;
  background: var(--cc-section-category-block-bg, #f9fafb);
  vertical-align: top;
}
#cc-main .cocalc-yt-card__text {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  flex-direction: column;
  gap: 0.25em;
  align-items: flex-start;
}
#cc-main .cocalc-yt-card__label {
  font-weight: 600;
  display: inline-block;
}
#cc-main .cocalc-yt-status {
  display: inline-block;
  padding: 0.15em 0.6em;
  border-radius: 999px;
  font-size: 0.85em;
  font-weight: 600;
  line-height: 1.4;
}
#cc-main .cocalc-yt-status--on {
  background: #d1fae5;
  color: #065f46;
}
#cc-main .cocalc-yt-status--off {
  background: #fee2e2;
  color: #991b1b;
}
#cc-main .cocalc-yt-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex: 0 0 auto;
  cursor: pointer;
}
#cc-main .cocalc-yt-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
#cc-main .cocalc-yt-slider {
  position: absolute;
  inset: 0;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.2s;
  display: inline-block;
}
#cc-main .cocalc-yt-slider::before {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  transition: transform 0.2s;
}
#cc-main .cocalc-yt-switch input:checked + .cocalc-yt-slider {
  background: #10b981;
}
#cc-main .cocalc-yt-switch input:checked + .cocalc-yt-slider::before {
  transform: translateX(20px);
}
#cc-main .cocalc-yt-switch input:focus-visible + .cocalc-yt-slider {
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35);
}
`;

export function buildYouTubeSectionHtml(): string {
  // Every wrapper is an inline element so the surrounding <p> v3 creates
  // for `section.description` stays valid HTML. Visual block layout is
  // recovered via display:inline-flex / inline-block in YOUTUBE_SECTION_CSS.
  return `
<span>
  Some pages embed YouTube videos. Playing them allows YouTube to set
  cookies in your browser, separately from the cookies described above.
  Videos stay blocked until you click them.
</span>
<span class="cocalc-yt-card">
  <span class="cocalc-yt-card__text">
    <span class="cocalc-yt-card__label">Embedded YouTube videos</span>
    <span id="${YOUTUBE_SECTION_STATUS_ID}" class="cocalc-yt-status cocalc-yt-status--off">Blocked</span>
  </span>
  <label class="cocalc-yt-switch" aria-label="Allow embedded YouTube videos">
    <input id="${YOUTUBE_SECTION_TOGGLE_ID}" type="checkbox" />
    <span class="cocalc-yt-slider"></span>
  </label>
</span>`;
}
