/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { join } from "path";
import { useEffect, type JSX } from "react";

import { hasTrackingConsent } from "@cocalc/frontend/cookie-consent";
import basePath from "lib/base-path";
import useCustomize from "lib/use-customize";

// Why so careful not to nest things?  See
//    https://nextjs.org/docs/api-reference/next/head
// NOTE:  Analytics can't be in Head because of script tags! https://github.com/vercel/next.js/pull/26253
//
// Cookie consent: when the banner is enabled, we MUST NOT render the GA /
// `/analytics.js` script tags during SSR — they would execute on the
// browser's HTML parse, before the user has had any chance to accept or
// decline. Instead we inject the scripts client-side from a useEffect that
// fires once tracking consent is granted (and listens for later changes).
// When the banner is disabled, fall back to the legacy SSR-script approach
// so existing deployments without the banner are unaffected.
export default function Analytics(): JSX.Element {
  const customize = useCustomize();
  const { googleAnalytics, cookieBannerEnabled } = customize;
  // True iff this page actually went through withCustomize. On pages that
  // didn't (e.g. 404, _error), useCustomize returns the empty-object default
  // and we have no way to know the admin's banner choice. cookieBannerEnabled
  // is always a boolean once customize is populated (admin defaults map to
  // false), so undefined is a reliable "customize missing" signal.
  const customizeAvailable = cookieBannerEnabled !== undefined;

  useEffect(() => {
    if (!cookieBannerEnabled) return; // SSR scripts already loaded (or N/A)
    if (typeof window === "undefined") return;
    let loaded = false;
    const tryLoad = () => {
      if (loaded) return;
      if (!hasTrackingConsent()) return;
      loaded = true;
      if (googleAnalytics) injectGoogleAnalytics(googleAnalytics);
      injectCoCalcAnalytics();
    };
    tryLoad();
    window.addEventListener("cc:onConsent", tryLoad);
    window.addEventListener("cc:onChange", tryLoad);
    // Banner may initialise after this component mounts; re-check next tick.
    const t = window.setTimeout(tryLoad, 0);
    return () => {
      window.removeEventListener("cc:onConsent", tryLoad);
      window.removeEventListener("cc:onChange", tryLoad);
      window.clearTimeout(t);
    };
  }, [cookieBannerEnabled, googleAnalytics]);

  // Customize unavailable (404 / _error): defer entirely.
  if (!customizeAvailable) return <></>;

  // Banner enabled: no SSR scripts; useEffect above handles loading after
  // consent. Empty fragment so the component still has a valid return.
  if (cookieBannerEnabled) return <></>;

  // Banner disabled: render scripts during SSR (legacy behavior). The GA
  // inline-init script uses dangerouslySetInnerHTML because the content is
  // hand-built from the admin-supplied tracking ID, mirroring the pre-PR
  // implementation; not new XSS surface.
  return (
    <>
      {googleAnalytics ? renderGoogleAnalyticsScripts(googleAnalytics) : null}
      <script
        async={true}
        defer={true}
        src={join(basePath, "analytics.js")}
      />
    </>
  );
}

function renderGoogleAnalyticsScripts(id: string) {
  const ga = `\
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');\
`;
  return (
    <>
      <script
        async={true}
        defer={true}
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
      />
      <script dangerouslySetInnerHTML={{ __html: ga }} />
    </>
  );
}

function injectGoogleAnalytics(id: string): void {
  const s = document.createElement("script");
  s.async = true;
  s.defer = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  const w = window as unknown as {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag(...args: unknown[]) {
    w.dataLayer.push(args);
  };
  w.gtag("js", new Date());
  w.gtag("config", id);
}

function injectCoCalcAnalytics(): void {
  const s = document.createElement("script");
  s.async = true;
  s.defer = true;
  s.src = join(basePath, "analytics.js");
  document.head.appendChild(s);
}
