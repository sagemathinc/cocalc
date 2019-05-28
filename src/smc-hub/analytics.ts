import * as misc from "smc-util/misc";
import * as ms from "ms";
const { DNS } = require("smc-util/theme");
import * as fs from "fs";
import * as TS from "typescript";
const UglifyJS = require("uglify-js");

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

export function analytics_rec(db, logger, token, payload): void {
  const dbg = create_log("rec", logger);
  dbg(token, payload);
  const rec_data: any = {};
  let account_id: string | undefined = undefined;
  // sanitize data (for now, limit size and number of characters)
  let cnt = 0;
  for (const key of Object.keys(payload)) {
    cnt += 1;
    if (cnt > 20) break;
    const rec_key = key.slice(0, 50);
    const rec_val = payload[key];
    // ignore keys without data
    if (rec_val == null) continue;
    // also sanitize value
    const val = rec_val.slice(0, 200);
    if (rec_key === "account_id") {
      account_id = val;
    } else {
      rec_data[rec_key] = val;
    }
  }

  // TODO merge rec_data into known data in DB

  if (account_id == null) return;

  db._query({
    query: "INSERT INTO analytics",
    values: {
      "token            :: UUID": token,
      "account_id       :: JSONB": account_id,
      "time_account_id  :: TIMESTAMP": new Date()
    },
    conflict: "token"
  });
}

export function analytics_cookie(res): void {
  // set the cookie (sign it?)
  const analytics_token = misc.uuid();
  res.cookie(misc.analytics_cookie_name, analytics_token, {
    path: "/",
    maxAge: ms("1 day"),
    httpOnly: true,
    domain: DNS
  });
}

// set the recorded analytics information on the given object (event log entry)
// then delete it
export function set_analytics_data(
  db: any,
  dbg: (str: string) => void | undefined,
  token: string,
  payload: object,
  del_data = true
): void {
  if (dbg != null) {
    dbg(`set_analytics_data ${token} obj=${JSON.stringify(payload)}`);
  }
  // TODO IMPL
  if (del_data) {
    // delete from analytics table
    db._query({
      query: "DELETE FROM analytics",
      where: [{ "token = $::UUID": token }]
    });
  }
}
