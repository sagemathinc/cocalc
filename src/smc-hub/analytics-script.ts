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

// variable PREFIX, DOMAIN and ID are injected in the hub's http server

// write cookie. it would be cool to set this via the http request itself,
// but for reasons I don't know it doesn't work across subdomains.
document.cookie = `${NAME}=${ID}; path=/; domain=${DOMAIN}; max-age=${24*60*60}`

const { href, protocol, host, pathname } = window.location;

// TODO: use the array defined in smc-util/misc.js
const UTM_KEYS = Object.freeze([
  "source",
  "medium",
  "campaign",
  "term",
  "content"
]);

const response: any = {};

const UTM = {};
const params = href.slice(href.indexOf("?") + 1).split("&");
let have_utm = false;
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
  have_utm = true;
}

if (have_utm) {
  response["utm"] = UTM;
}

// do we have a referrer? (not just "")
if (document.referrer.length > 0) {
  response["referrer"] = document.referrer;
}

// also keep a note about the very first landing page
response["landing"] = `${protocol}//${host}${pathname}`;

// send back a beacon (token is in an http-only cookie)
window
  .fetch(PREFIX + "/analytics.js", {
    method: "POST",
    mode: "no-cors",
    cache: "no-cache",
    credentials: "include", // include, *same-origin, omit
    headers: {
      "Content-Type": "application/json"
    },
    redirect: "follow",
    body: JSON.stringify(response)
  })
  .then(response => console.log("Success:", response))
  .catch(error => console.error("Error:", error));
