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
 */

// variables DNS and BASE_URL are injected

const href = window.location.href;

// TODO: use the array defined in smc-util/misc.js
const UTM_KEYS = Object.freeze([
  "source",
  "medium",
  "campaign",
  "term",
  "content"
]);

const UTM = {};
const params = href.slice(href.indexOf("?") + 1).split("&");

for (const i = 0; i < params.length; i++) {
  const part = params[i];
  const k_v = part.split("=");
  const k = k_v[0];
  const v = k_v[1];
  if (k == null || v == null) continue;
  if (k.slice(0, 4) !== "utm_") continue;
  k = k.slice(4);
  if (!UTM_KEYS.includes(k)) continue;
  UTM[k] = window.decodeURIComponent(v.slice(0, 100));
}

// do we have a referrer? (not just "")
const REF = document.referrer.length > 0 ? document.referrer : undefined;

// also keep a note about the very first landing page
const LANDING = location.protocol + "//" + location.host + location.pathname;

// send back a beacon (token is in the http-only cookie)
const xhr = new XMLHttpRequest();
xhr.open("POST", "https://" + DNS + BASE_URL + "/analytics.js", true);
xhr.setRequestHeader("Content-Type", "application/json");
xhr.send(
  JSON.stringify({
    utm: UTM,
    referrer: REF,
    landing: LANDING
  })
);
