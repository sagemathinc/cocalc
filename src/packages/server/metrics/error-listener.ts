import TTLCache from "@isaacs/ttlcache";
import { getLogger } from "@cocalc/backend/logger";
import { new_counter } from "./metrics-recorder";
import { db } from "@cocalc/database";

const logger = getLogger("metrics:error-listener");

// addErrorListeners: after successful startup, don't crash on routine errors.
// We don't do this until startup, since we do want to crash on errors on startup.

// Use cache to not save the SAME error to the database (and prometheus)
// more than once per minute.
const errorReportCache = new TTLCache({ ttl: 60 * 1000 });

// note -- we show the error twice in these, one in backticks, since sometimes
// that works better.
let initialized = false;
export function addErrorListeners() {
  if (initialized) {
    return;
  }
  initialized = true;
  const uncaught_exception_total = new_counter(
    "uncaught_exception_total",
    'counts "BUG"s',
  );
  const database = db();
  logger.debug("enabling uncaughtException handler");
  process.addListener("uncaughtException", (err) => {
    const e = `${err}`;
    if (e.includes("ECONNRESET")) {
      // we whitelist these, since I've audited everything I can and just
      // cannot find what's causing them in hub-conat-api
      logger.debug(`WARNING -- ${e}`, err, err.stack);
      console.error(err);
      return;
    }

    logger.error(
      "BUG ****************************************************************************",
    );
    logger.error("Uncaught exception: " + err, ` ${err}`);
    console.error(err);
    logger.error(err.stack);
    logger.error(
      "BUG ****************************************************************************",
    );
    const key = `${err}`;
    if (errorReportCache.has(key)) {
      return;
    }
    errorReportCache.set(key, true);
    database?.uncaught_exception(err);
    uncaught_exception_total.inc(1);
  });

  return process.on("unhandledRejection", (reason, p) => {
    logger.error(
      "BUG UNHANDLED REJECTION *********************************************************",
    );
    console.error(p, reason); // strangely sometimes logger.error can't actually show the traceback...
    logger.error(
      "Unhandled Rejection at:",
      p,
      "reason:",
      reason,
      ` : ${p} -- ${reason}`,
    );
    logger.error(
      "BUG UNHANDLED REJECTION *********************************************************",
    );
    const key = `${p}${reason}`;
    if (errorReportCache.has(key)) {
      return;
    }
    errorReportCache.set(key, true);
    database?.uncaught_exception(reason);
    uncaught_exception_total.inc(1);
  });
}
