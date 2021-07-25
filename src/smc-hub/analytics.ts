/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import * as ms from "ms";
import { isEqual } from "lodash";
import { Router } from "express";
import {
  analytics_cookie_name,
  is_valid_uuid_string,
  uuid,
} from "smc-util/misc";
import { PostgreSQL } from "./postgres/types";
import { get_server_settings, pii_retention_to_future } from "./utils";
import * as fs from "fs";
const UglifyJS = require("uglify-js");
// express-js cors plugin
import * as cors from "cors";
import {
  parseDomain,
  fromUrl,
  ParseResultType,
  ParseResult,
} from "parse-domain";
import { getLogger } from "./logger";

// Minifying analytics-script.js.  Note
// that this file analytics.ts gets compiled to
// dist/analytics.js and also analytics-script.ts
// gets compiled to dist/analytics-script.js.
export const analytics_js = UglifyJS.minify(
  fs.readFileSync(join(__dirname, "analytics-script.js")).toString()
).code;

function create_log(name) {
  return getLogger(`analytics.${name}`).debug;
}

// base64 encoded PNG (white), 1x1 pixels
const _PNG_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const PNG_1x1 = Buffer.from(_PNG_DATA, "base64");

function sanitize(obj: object): any {
  const ret: any = {};
  let cnt = 0;
  for (const key of Object.keys(obj)) {
    cnt += 1;
    if (cnt > 20) break;
    const key_san = key.slice(0, 50);
    let val_san = obj[key];
    if (val_san == null) continue;
    if (typeof val_san === "object") {
      val_san = sanitize(val_san);
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
function recordAnalyticsData(
  db: any,
  token: string,
  payload: object | undefined,
  pii_retention: number | false
): void {
  if (payload == null) return;
  if (!is_valid_uuid_string(token)) return;
  const dbg = create_log("rec");
  dbg(token, payload);
  // sanitize data (limits size and number of characters)
  const rec_data = sanitize(payload);
  dbg("rec_data", rec_data);
  const expire = pii_retention_to_future(pii_retention);

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
}

// could throw an error
function check_cors(
  origin: string | undefined,
  dns_parsed: ParseResult,
  dbg: Function
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
    if (
      isEqual(origin_parsed.topLevelDomains, dns_parsed.topLevelDomains) &&
      origin_parsed.domain === dns_parsed.domain
    ) {
      return true;
    }
    if (isEqual(origin_parsed.topLevelDomains, ["com"])) {
      if (
        origin_parsed.domain === "cocalc" ||
        origin_parsed.domain === "sagemath"
      ) {
        return true;
      }
    }
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

import base_path from "smc-util-node/base-path";

export async function initAnalytics(
  router: Router,
  database: PostgreSQL
): Promise<void> {
  const dbg = create_log("analytics_js/cors");

  // we only get the DNS once at startup – i.e. hub restart required upon changing DNS!
  const settings = await get_server_settings(database);
  const DNS = settings.dns;
  const dns_parsed = parseDomain(DNS);
  const pii_retention = settings.pii_retention;

  if (
    dns_parsed.type !== ParseResultType.Listed &&
    dns_parsed.type !== ParseResultType.Reserved
  ) {
    dbg(
      `WARNING: the configured domain name ${DNS} cannot be parsed properly. ` +
        `Please fix it in Admin → Site Settings!\n` +
        `dns_parsed="${JSON.stringify(dns_parsed)}}"`
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
        if (check_cors(origin, dns_parsed, dbg)) {
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

  router.get("/analytics.js", cors(analytics_cors), function (req, res) {
    res.header("Content-Type", "text/javascript");
    // in case user was already here, do not send it again.
    // only the first hit is interesting.
    dbg(
      `/analytics.js GET analytics_cookie='${req.cookies[analytics_cookie_name]}'`
    );

    // also, don't write a script if the DNS is not valid
    if (
      req.cookies[analytics_cookie_name] ||
      dns_parsed.type !== ParseResultType.Listed
    ) {
      // cache for 6 hours
      res.header("Cache-Control", `private, max-age=${6 * 60 * 60}`);
      res.write("// NOOP");
      res.end();
      return;
    }

    // write response script
    // this only runs once, hence no caching
    res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    //analytics_cookie(DNS, res)

    const DOMAIN = `${dns_parsed.domain}.${dns_parsed.topLevelDomains.join(
      "."
    )}`;
    res.write(`var NAME = '${analytics_cookie_name}';\n`);
    res.write(`var ID = '${uuid()}';\n`);
    res.write(`var DOMAIN = '${DOMAIN}';\n`);
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

  // tracking image: this is a 100% experimental idea and not used
  router.get(
    "/analytics.js/track.png",
    cors(analytics_cors),
    function (req, res) {
      // in case user was already here, do not set a cookie
      if (!req.cookies[analytics_cookie_name]) {
        analytics_cookie(DNS, res);
      }
      res.header("Content-Type", "image/png");
      res.header("Content-Length", `${PNG_1x1.length}`);
      return res.end(PNG_1x1);
    }
  );

  router.post("/analytics.js", cors(analytics_cors), function (req, res): void {
    // check if token is in the cookie (see above)
    // if not, ignore it
    const token = req.cookies[analytics_cookie_name];
    dbg(`/analytics.js POST token='${token}'`);
    if (token) {
      // req.body is an object (json middlewhere somewhere?)
      // e.g. {"utm":{"source":"asdfasdf"},"landing":"https://cocalc.com/..."}
      // ATTN key/values could be malicious
      dbg(
        `/analytics.js -- TOKEN=${token} -- DATA=${JSON.stringify(req.body)}`
      );
      // record it, there is no need for a callback
      recordAnalyticsData(database, token, req.body, pii_retention);
    }
    res.end();
  });

  // additionally, custom content types require a preflight cors check
  router.options("/analytics.js", cors(analytics_cors));
}

function analytics_cookie(DNS: string, res): void {
  // set the cookie (TODO sign it?)
  const analytics_token = uuid();
  res.cookie(analytics_cookie_name, analytics_token, {
    path: "/",
    maxAge: ms("7 days"),
    // httpOnly: true,
    domain: DNS,
  });
}
