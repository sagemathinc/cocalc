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

export function analytics_rec(db, logger, token, data): void {
  const dbg = create_log("rec", logger);
  dbg(token, data);
  const rec_data: any = {};
  // sanitize data (for now, limit size and number of characters)
  let cnt = 0;
  for (const key of data) {
    cnt += 1;
    if (cnt > 20) break;
    const rec_key = key.slice(0, 50);
    const rec_val = data[key].slice(0, 200);
    rec_data[rec_key] = rec_val;
  }

  db._query({
    query: "INSERT INTO analytics",
    values: {
      "token  :: UUID": token,
      "data   :: JSONB": rec_data,
      "time   :: TIMESTAMP": new Date()
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
  obj: object,
  token: string,
  del_data = true
): void {
  if (dbg != null) {
    dbg(`set_analytics_data ${token} obj=${JSON.stringify(obj)}`);
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
