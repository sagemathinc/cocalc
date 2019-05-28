import * as misc from "smc-util/misc";
import * as ms from "ms";
// const { DNS } = require("smc-util/theme");
import * as fs from "fs";
import * as TS from "typescript";
const UglifyJS = require("uglify-js");
import { is_valid_uuid_string } from "../smc-util/misc2";

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
const png_data =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
export const png_1x1 = new Buffer(png_data, "base64");

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
export function analytics_rec(
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

export function analytics_cookie(res): void {
  // set the cookie (TODO sign it?)
  const analytics_token = misc.uuid();
  // console.log("analytics_cookie DNS=", DNS);
  res.cookie(misc.analytics_cookie_name, analytics_token, {
    path: "/",
    maxAge: ms("100 days"),
    httpOnly: true
    //domain: DNS // what's the real implication of setting the domain?
  });
}
