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

// TODO: use the values which are defined in smc-util/misc.js
var UTM_COOKIE = "CC_UTM";
var REF_COOKIE = "CC_REF";
var REF_LANDING = "CC_LAND";
var DNS = "cocalc.com";

// cookie expiration
var days = 1;
var date = new Date();
date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
var expires = "expires=" + date.toUTCString();

var cookie_tail = "; " + expires + "; path=/; domain=" + DNS;

if (document.cookie.indexOf("; " + UTM_COOKIE + "=") === -1) {
  var utm = {};
  var write_cookie = false;
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
    write_cookie = true;
  }
  if (write_cookie) {
    var data = JSON.stringify(utm);
    document.cookie = UTM_COOKIE + "=" + encodeURIComponent(data) + cookie_tail;
  }
}

// do we have a referrer? store it if we do not already have it
if (
  document.referrer.length > 0 &&
  document.cookie.indexOf("; " + REF_COOKIE + "=") === -1
) {
  var url = location.hostname.replace(".", "\\.");
  var re = new RegExp("://(.*.|)" + url + "/");
  if (!document.referrer.match(re)) {
    document.cookie = REF_COOKIE + "=" + encodeURIComponent(document.referrer) + cookie_tail;
  }encodeURIComponent
}

// also keep a note about the very first landing page
if (document.cookie.indexOf("; " + REF_LANDING + "=") === -1) {
  var landing = location.protocol + "//" + location.host + location.pathname;
  document.cookie = REF_LANDING + "=" + encodeURIComponent(landing) + cookie_tail;
}
