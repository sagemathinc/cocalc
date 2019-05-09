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

var href = window.location.href;

// TODO: use the array defined in smc-util/misc.js
var UTM_KEYS = Object.freeze([
  "source",
  "medium",
  "campaign",
  "term",
  "content"
]);

var UTM = {};
var params = href.slice(href.indexOf("?") + 1).split("&");
for (var i = 0; i < params.length; i++) {
  var part = params[i];
  var k_v = part.split("=");
  var k = k_v[0];
  var v = k_v[1];
  if (k == null || v == null) continue;
  if (k.slice(0, 4) !== "utm_") continue;
  k = k.slice(4);
  if (!UTM_KEYS.includes(k)) continue;
  UTM[k] = window.decodeURIComponent(v.slice(0, 100));
}

// do we have a referrer? (not just "")
var REF = document.referrer.length > 0 ? document.referrer : undefined;

// also keep a note about the very first landing page
var LANDING = location.protocol + "//" + location.host + location.pathname;

// send back a beacon (token is in the http-only cookie)
var xhr = new XMLHttpRequest();
xhr.open("POST", "https://" + DNS + BASE_URL + "/analytics.js", true);
xhr.setRequestHeader("Content-Type", "application/json");
xhr.send(
  JSON.stringify({
    utm: UTM,
    referrer: REF,
    landing: LANDING
  })
);
