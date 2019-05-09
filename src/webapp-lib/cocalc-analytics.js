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
var href = window.location.href;

// TODO: use the array defined in smc-util/misc.js
var UTM_KEYS = Object.freeze([
  "source",
  "medium",
  "campaign",
  "term",
  "content"
]);

var utm = {};
for (
  var _i = 0, _a = href.slice(href.indexOf("?") + 1).split("&");
  _i < _a.length;
  _i++
) {
  var part = _a[_i];
  var _b = part.split("="),
    k = _b[0],
    v = _b[1];
  if (k == null || v == null) continue;
  if (k.slice(0, 4) !== "utm_") continue;
  k = k.slice(4);
  if (!UTM_KEYS.includes(k)) continue;
  utm[k] = window.decodeURIComponent(v.slice(0, 100));
}

// do we have a referrer? store it if we do not already have it
var REF = document.referrer.length > 0 ? document.referrer : undefined;

// also keep a note about the very first landing page
var LANDING = location.protocol + "//" + location.host + location.pathname;

// send back beacon
var xhr = new XMLHttpRequest();
xhr.open("POST", "https://" + DNS + BASE_URL + "/analytics.js", true);
xhr.setRequestHeader("Content-Type", "application/json");
xhr.send(
  JSON.stringify({
    token: TOKEN,
    utm: utm,
    referrer: REF,
    landing: LANDING
  })
);
