/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import cors from "cors"; // express-js cors plugin
import { json, Router } from "express";
import * as fs from "fs";
import { isEqual } from "lodash";
import ms from "ms";
import {
  fromUrl,
  parseDomain,
  ParseResult,
  ParseResultType,
} from "parse-domain";
import { join } from "path";
const UglifyJS = require("uglify-js");

import { is_valid_uuid_string, uuid } from "@cocalc/util/misc";

import { pii_retention_to_future } from "@cocalc/database/postgres/pii";
import { get_server_settings } from "@cocalc/database/postgres/server-settings";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import { ANALYTICS_COOKIE_NAME } from "@cocalc/util/consts";

import { getLogger } from "./logger";

// Rate limiting for analytics data - 10 entries per second
const RATE_LIMIT_ENTRIES_PER_SECOND = 10;
const RATE_LIMIT_WINDOW_MS = 1000;
let rateLimitCounter = 0;
let rateLimitWindowStart = Date.now();

// Minifying analytics-script.js.  Note
// that this file analytics.ts gets compiled to
// dist/analytics.js and also analytics-script.ts
// gets compiled to dist/analytics-script.js.
const result = UglifyJS.minify(
  fs.readFileSync(join(__dirname, "analytics-script.js")).toString(),
);
if (result.error) {
  throw Error(`Error minifying analytics-script.js -- ${result.error}`);
}
export const analytics_js =
  "if (window.exports === undefined) { var exports={}; } \n" + result.code;

function create_log(name) {
  return getLogger(`analytics.${name}`).debug;
}

// Rate limiting check - returns true if request should be allowed
function checkRateLimit(): boolean {
  const now = Date.now();

  // Reset counter if window has passed
  if (now - rateLimitWindowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitCounter = 0;
    rateLimitWindowStart = now;
  }

  // Check if we're under the limit
  if (rateLimitCounter < RATE_LIMIT_ENTRIES_PER_SECOND) {
    rateLimitCounter++;
    return true;
  }

  return false;
}

/*
// base64 encoded PNG (white), 1x1 pixels
const _PNG_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const PNG_1x1 = Buffer.from(_PNG_DATA, "base64");
*/

function sanitize(obj: object, recursive = 0): any {
  if (recursive >= 2) return { error: "recursion limit" };
  const ret: any = {};
  let cnt = 0;
  for (const key of Object.keys(obj)) {
    cnt += 1;
    if (cnt > 20) break;
    const key_san = key.slice(0, 50);
    let val_san = obj[key];
    if (val_san == null) continue;
    if (typeof val_san === "object") {
      val_san = sanitize(val_san, recursive + 1);
    } else if (typeof val_san === "string") {
      val_san = val_san.slice(0, 2000);
    } else {
      // do nothing
    }
    ret[key_san] = val_san;
  }
  return ret;
}

// record analytics data
// case 1: store "token" with associated "data", referrer, utm, etc.
// case 2: update entry with a known "token" with the account_id + 2nd timestamp
// case 3: cookieless tracking - store data without user association
function recordAnalyticsData(
  db: any,
  token: string | null,
  payload: object | undefined,
  pii_retention: number | false,
): void {
  if (payload == null) return;

  // Rate limiting check - applies to all analytics data recording
  if (!checkRateLimit()) {
    const dbg = create_log("record");
    dbg("Rate limit exceeded, dropping analytics data");
    return;
  }

  const dbg = create_log("record");
  dbg({ token, payload });

  // sanitize data (limits size and number of characters)
  const rec_data = sanitize(payload);
  dbg("sanitized data", rec_data);
  const expire = pii_retention_to_future(pii_retention);

  // Cookie-based tracking (with user association)
  if (token != null && is_valid_uuid_string(token)) {
    if (rec_data.account_id != null) {
      // dbg("update analytics", rec_data.account_id);
      // only update if account id isn't already set!
      db._query({
        query: "UPDATE analytics",
        where: [{ "token = $::UUID": token }, "account_id IS NULL"],
        set: {
          "account_id       :: UUID": rec_data.account_id,
          "account_id_time  :: TIMESTAMP": new Date(),
          "expire           :: TIMESTAMP": expire,
        },
      });
    } else {
      db._query({
        query: "INSERT INTO analytics",
        values: {
          "token     :: UUID": token,
          "data      :: JSONB": rec_data,
          "data_time :: TIMESTAMP": new Date(),
          "expire    :: TIMESTAMP": expire,
        },
        conflict: "token",
      });
    }
  } else {
    // Cookieless tracking (no user association, privacy-focused)
    // Generate a random token for this single entry
    const anonymousToken = uuid();
    db._query({
      query: "INSERT INTO analytics",
      values: {
        "token     :: UUID": anonymousToken,
        "data      :: JSONB": { ...rec_data, cookieless: true },
        "data_time :: TIMESTAMP": new Date(),
        "expire    :: TIMESTAMP": expire,
      },
      conflict: "token",
    });
  }
}

// could throw an error
function checkCORS(
  origin: string | undefined,
  dns_parsed: ParseResult,
  dbg: Function,
): boolean {
  // no origin, e.g. when loaded as usual in a script tag
  if (origin == null) return true;

  // origin could be https://...
  const origin_parsed = parseDomain(fromUrl(origin));
  if (origin_parsed.type === ParseResultType.Reserved) {
    // This happens, e.g., when origin is https://localhost, which happens with cocalc-docker.
    return true;
  }
  // the configured DNS name is not ok
  if (dns_parsed.type !== ParseResultType.Listed) {
    dbg(`parsed DNS domain invalid: ${JSON.stringify(dns_parsed)}`);
    return false;
  }
  // now, we want dns_parsed and origin_parsed to be valid and listed
  if (origin_parsed.type === ParseResultType.Listed) {
    // most likely case: same domain as settings.DNS
    if (
      isEqual(origin_parsed.topLevelDomains, dns_parsed.topLevelDomains) &&
      origin_parsed.domain === dns_parsed.domain
    ) {
      return true;
    }
    // we also allow cocalc.com and sagemath.com
    if (isEqual(origin_parsed.topLevelDomains, ["com"])) {
      if (
        origin_parsed.domain === "cocalc" ||
        origin_parsed.domain === "sagemath"
      ) {
        return true;
      }
    }
    // … as well as sagemath.org
    if (
      isEqual(origin_parsed.topLevelDomains, ["org"]) &&
      origin_parsed.domain === "sagemath"
    ) {
      return true;
    }
  }
  return false;
}

/*
cocalc analytics setup -- this is used in http_hub_server to setup the /analytics.js endpoint

this extracts tracking information about landing pages, measure campaign performance, etc.

1. it sends a static js file (which is included in a script tag) to a page
2. a unique ID is generated and stored in a cookie
3. the script (should) send back a POST request, telling us about
   the UTM params, referral, landing page, etc.

The query param "fqd" (fully qualified domain) can be set to true or false (default true)
It controls if the bounce back URL mentions the domain.
*/

import base_path from "@cocalc/backend/base-path";

export async function initAnalytics(
  router: Router,
  database: PostgreSQL,
): Promise<void> {
  const dbg = create_log("analytics_js/cors");

  // we only get the DNS once at startup – i.e. hub restart required upon changing DNS!
  const settings = await get_server_settings();
  const DNS = settings.dns;
  const dns_parsed = parseDomain(DNS);
  const pii_retention = settings.pii_retention;
  const analytics_enabled = settings.analytics_cookie;

  if (
    dns_parsed.type !== ParseResultType.Listed &&
    dns_parsed.type !== ParseResultType.Reserved
  ) {
    dbg(
      `WARNING: the configured domain name ${DNS} cannot be parsed properly. ` +
        `Please fix it in Admin → Site Settings!\n` +
        `dns_parsed="${JSON.stringify(dns_parsed)}}"`,
    );
  }

  // CORS-setup: allow access from other trusted (!) domains
  const analytics_cors = {
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "*"],
    origin: function (origin, cb) {
      dbg(`check origin='${origin}'`);
      try {
        if (checkCORS(origin, dns_parsed, dbg)) {
          cb(null, true);
        } else {
          cb(`origin="${origin}" is not allowed`, false);
        }
      } catch (e) {
        cb(e);
        return;
      }
    },
  };

  // process POST body data
  // https://expressjs.com/en/api.html#express.json
  router.use("/analytics.js", json());

  router.get("/analytics.js", cors(analytics_cors), function (req, res) {
    res.header("Content-Type", "text/javascript");

    // in case user was already here, do not send it again.
    // only the first hit is interesting.
    dbg(
      `/analytics.js GET analytics_cookie='${req.cookies[ANALYTICS_COOKIE_NAME]}'`,
    );

    if (!req.cookies[ANALYTICS_COOKIE_NAME] && analytics_enabled) {
      // No analytics cookie is set and cookies are enabled, so we set one.
      // When analytics_enabled is false, we skip setting cookies to enable
      // cookieless tracking for better privacy.
      setAnalyticsCookie(res /* DNS */);
    }

    // Return NOOP if DNS is invalid, or if cookies are enabled and already exist
    if (
      dns_parsed.type !== ParseResultType.Listed ||
      (analytics_enabled && req.cookies[ANALYTICS_COOKIE_NAME])
    ) {
      // cache for 6 hours -- max-age has unit seconds
      res.header(
        "Cache-Control",
        `private, max-age=${6 * 60 * 60}, must-revalidate`,
      );
      res.write("// NOOP");
      res.end();
      return;
    }

    // write response script
    // this only runs once, hence no caching
    res.header("Cache-Control", "no-cache, no-store");

    const DOMAIN = `${dns_parsed.domain}.${dns_parsed.topLevelDomains.join(
      ".",
    )}`;
    res.write(`var NAME = '${ANALYTICS_COOKIE_NAME}';\n`);
    res.write(`var ID = '${uuid()}';\n`);
    res.write(`var DOMAIN = '${DOMAIN}';\n`);
    res.write(`var ANALYTICS_ENABLED = ${analytics_enabled};\n`);
    //  BASE_PATH
    if (req.query.fqd === "false") {
      res.write(`var PREFIX = '${base_path}';\n`);
    } else {
      const prefix = `//${DOMAIN}${base_path}`;
      res.write(`var PREFIX = '${prefix}';\n\n`);
    }
    res.write(analytics_js);
    return res.end();
  });

  /*
  // tracking image: this is a 100% experimental idea and not used
  router.get(
    "/analytics.js/track.png",
    cors(analytics_cors),
    function (req, res) {
      // in case user was already here, do not set a cookie
      if (!req.cookies[analytics_cookie_name]) {
        setAnalyticsCookie(res); // ,DNS);
      }
      res.header("Content-Type", "image/png");
      res.header("Content-Length", `${PNG_1x1.length}`);
      return res.end(PNG_1x1);
    }
  );
  */

  router.post("/analytics.js", cors(analytics_cors), function (req, res): void {
    const token = req.cookies[ANALYTICS_COOKIE_NAME];
    dbg(`/analytics.js POST token='${token}'`);

    // req.body is an object (json middleware somewhere?)
    // e.g. {"utm":{"source":"asdfasdf"},"landing":"https://cocalc.com/..."}
    // ATTN key/values could be malicious

    // Always record analytics data - either with token (cookie-based) or without (cookieless)
    // The recordAnalyticsData function handles both cases
    recordAnalyticsData(database, token || null, req.body, pii_retention);

    res.end();
  });

  // additionally, custom content types require a preflight cors check
  router.options("/analytics.js", cors(analytics_cors));
}

// I'm not setting the domain, since it's making testing difficult.
function setAnalyticsCookie(res /* DNS: string */): void {
  // set the cookie (TODO sign it?  that would be good so that
  // users can fake a cookie.)
  const analytics_token = uuid();
  res.cookie(ANALYTICS_COOKIE_NAME, analytics_token, {
    path: "/",
    maxAge: ms("7 days"),
    // httpOnly: true,
    // domain: DNS,
  });
}
