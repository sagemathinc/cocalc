import * as ms from "ms";
import { analytics_cookie_name } from "smc-util/misc";
import * as fs from "fs";
import * as TS from "typescript";
const UglifyJS = require("uglify-js");
import { is_valid_uuid_string, uuid } from "../smc-util/misc2";
// express-js cors plugin
import * as cors from "cors";
// this splits into { subdomain: "dev" or "", domain: "cocalc",  tld: "com" }
const parseDomain = require("parse-domain");
import { DNS } from "smc-util/theme";
const pdDNS = parseDomain(DNS);

// compiling analytics-script.ts and minifying it.
export const analytics_js = UglifyJS.minify(
  TS.transpileModule(fs.readFileSync("./analytics-script.ts").toString(), {
    compilerOptions: { module: TS.ModuleKind.CommonJS }
  }).outputText
).code;

function create_log(name, logger) {
  if (logger != null) {
    return (...m) => logger.debug(`analytics.${name}: `, ...m);
  } else {
    return () => {};
  }
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
function analytics_rec(
  db: any,
  logger: any,
  token: string,
  payload: object | undefined
): void {
  if (payload == null) return;
  if (!is_valid_uuid_string(token)) return;
  const dbg = create_log("rec", logger);
  dbg(token, payload);
  // sanitize data (limits size and number of characters)
  const rec_data = sanitize(payload);
  dbg("rec_data", rec_data);

  if (rec_data.account_id != null) {
    // dbg("update analytics", rec_data.account_id);
    // only update if account id isn't already set!
    db._query({
      query: "UPDATE analytics",
      where: [{ "token = $::UUID": token }, "account_id IS NULL"],
      set: {
        "account_id       :: UUID": rec_data.account_id,
        "account_id_time  :: TIMESTAMP": new Date()
      }
    });
  } else {
    db._query({
      query: "INSERT INTO analytics",
      values: {
        "token     :: UUID": token,
        "data      :: JSONB": rec_data,
        "data_time :: TIMESTAMP": new Date()
      },
      conflict: "token"
    });
  }
}

/*
cocalc analytics setup -- this is used in http_hub_server to setup the /analytics.js endpoint

this extracts tracking information about lading pages, measure campaign performance, etc.

1. it sends a static js file (which is included in a script tag) to a page
2. a unique ID is generated and stored in a cookie
3. the script (should) send back a POST request, telling us about
   the UTM params, referral, landing page, etc.

The query param "fqd" (fully qualified domain) can be set to true or false (default true)
It controls if the bounce back URL mentions the domain.
*/

export function setup_analytics_js(
  router: any,
  database: any,
  logger: any,
  base_url: string
): void {
  const dbg = create_log("analytics_js", logger);

  // CORS-setup: allow access from other trusted (!) domains
  const analytics_cors = {
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "*"],
    origin(origin, cb) {
      dbg(`analytics_cors origin='${origin}'`);
      // no origin, e.g. when loaded as usual in a script tag
      if (origin == null) {
        cb(null, true);
        return;
      }

      let allow = false;
      try {
        const pd = parseDomain(origin);
        if (pd.tld === "com") {
          if (pd.domain === "cocalc" || pd.domain === "sagemath") {
            allow = true;
          }
        } else if (pd.tld === "org" && pd.domain === "sagemath") {
          allow = true;
        } else if (pd.tld === pdDNS.tld && pd.domain === pdDNS.domain) {
          allow = true;
        }
      } catch (e) {
        cb(e);
        return;
      }

      if (allow) {
        cb(null, true);
      } else {
        cb("CORS: not allowed", false);
      }
    }
  };

  router.get("/analytics.js", cors(analytics_cors), function(req, res) {
    res.header("Content-Type", "text/javascript");
    res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");

    // in case user was already here, do not send it again.
    // only the first hit is interesting.
    dbg(
      `/analytics.js GET analytics_cookie='${
        req.cookies[analytics_cookie_name]
      }'`
    );
    if (req.cookies[analytics_cookie_name]) {
      res.write("// NOOP");
      res.end();
      return;
    }

    // write response script
    //analytics_cookie(res)
    res.write(`var NAME = '${analytics_cookie_name}';\n`);
    res.write(`var ID = '${uuid()}';\n`);
    res.write(`var DOMAIN = '${pdDNS.domain}.${pdDNS.tld}';\n`);
    //  BASE_URL
    if (req.query.fqd === "false") {
      res.write(`var PREFIX = '${base_url}';\n`);
    } else {
      const prefix = `//${DNS}${base_url}`;
      res.write(`var PREFIX = '${prefix}';\n\n`);
    }
    res.write(analytics_js);
    return res.end();
  });

  // tracking image: this is a 100% experimental idea and not used
  router.get("/analytics.js/track.png", cors(analytics_cors), function(
    req,
    res
  ) {
    // in case user was already here, do not set a cookie
    if (!req.cookies[analytics_cookie_name]) {
      analytics_cookie(res);
    }
    res.header("Content-Type", "image/png");
    res.header("Content-Length", PNG_1x1.length);
    return res.end(PNG_1x1);
  });

  router.post("/analytics.js", cors(analytics_cors), function(req, res): void {
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
      analytics_rec(database, logger, token, req.body);
    }
    res.end();
  });

  // additionally, custom content types require a preflight cors check
  router.options("/analytics.js", cors(analytics_cors));
}

function analytics_cookie(res): void {
  // set the cookie (TODO sign it?)
  const analytics_token = uuid();
  res.cookie(analytics_cookie_name, analytics_token, {
    path: "/",
    maxAge: ms("7 days"),
    // httpOnly: true,
    domain: DNS
  });
}
