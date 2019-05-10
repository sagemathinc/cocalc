import * as misc from "smc-util/misc";
import * as ms from "ms";
const { DNS } = require("smc-util/theme");

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
  const dbg = create_log("main", logger);
  dbg(token, data);
  db._query({
    query: "INSERT INTO analytics",
    values: {
      "token  :: UUID": token,
      "data   :: JSONB": data,
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
