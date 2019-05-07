/*
 * CoCalc native analytics
 *
 * This script saves some information about how, from where and why someone came on a cocalc page.
 * It checks for UTM parameters and the referral and landing page.
 * On kucalc, static pages are served without going through the hub.
 * Therefore we have to do the extraction on static pages,
 * which will also work on adjacent pages like the documentation.
 * The cookies are only set if they're new.
 * e.g. this filters the SSO auth pages, which are uninteresting referrals
 *
 * devOps tipp: check this file via $ tsc --noEmit cocalc-analytics.ts
 */

interface Window {
  decodeURIComponent: (str: string) => string;
  encodeURIComponent: (str: string) => string;
  location: Location;
}

declare var window: Window;

const { href } = window.location;

// TODO: use the array defined in smc-util/misc.js
const UTM_KEYS = Object.freeze([
  "source",
  "medium",
  "campaign",
  "term",
  "content"
]);

// TODO: use the values which are defined in smc-util/misc.js
const UTM_COOKIE = "CC_UTM";
const REF_COOKIE = "CC_REF";
const REF_LANDING = "CC_LAND";

// cookie expiration
const days = 1;
const date = new Date();
date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
const expires = `expires=${date.toUTCString()}`;

if (document.cookie.indexOf(`; ${UTM_COOKIE}=`) === -1) {
  const utm: any = {};
  let write_cookie = false;

  for (const part of href.slice(href.indexOf("?") + 1).split("&")) {
    let [k, v] = part.split("=");
    if (k == null || v == null) continue;
    if (k.slice(0, 4) !== "utm_") continue;
    k = k.slice(4);
    if (!UTM_KEYS.includes(k)) continue;
    utm[k] = window.decodeURIComponent(v.slice(0, 100));
    write_cookie = true;
  }

  if (write_cookie) {
    const data = JSON.stringify(utm);
    document.cookie = `${UTM_COOKIE}=${data}; ${expires}; path=/`;
  }
}

// do we have a referrer? store it if we do not already have it
if (
  document.referrer.length > 0 &&
  document.cookie.indexOf(`; ${REF_COOKIE}=`) === -1
) {
  const url = location.hostname.replace(".", "\\.");
  const re = new RegExp(`:\/\/(.*\.|)${url}\/`);
  if (!document.referrer.match(re)) {
    document.cookie = `${REF_COOKIE}=${document.referrer}; ${expires}; path=/`;
  }
}

// also keep a note about the very first landing page
if (document.cookie.indexOf(`; ${REF_LANDING}=`) === -1) {
  const landing = `${location.protocol}//${location.host}${location.pathname}`;
  document.cookie = `${REF_LANDING}=${landing}; ${expires}; path=/`;
}
