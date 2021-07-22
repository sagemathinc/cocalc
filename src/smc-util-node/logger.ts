/*
Winston logger for a node.js server.

There is used both by the hub(s) and project(s).
*/

import { join } from "path";

import * as winston from "winston";
import "winston-daily-rotate-file"; // makes DailyRotateFile available
const { format } = winston;
const { colorize, combine, printf, timestamp } = format;
import { logs } from "./data";

let counter: any = undefined;
export function setCounter(f) {
  counter = f;
}

// getLogger(name) creates a logger that is tagged with the name, and in development
// logs info+ to console and debug+ to a file.  In production, it logs debug+ to console.
// Use it like this:
//       logger = require('smc-util-node/logger').getLogger('foo')
//       logger.debug('foo')
//       logger.info('bar')<strong></strong>
const cache: { [name: string]: winston.Logger } = {};
export function getLogger(name: string): winston.Logger {
  if (cache[name] != null) {
    return cache[name];
  }
  return (cache[name] = getLoggerNoCache(name));
}

let hasShownError: boolean = false;

function getLoggerNoCache(name: string): winston.Logger {
  if (process.env.SMC_TEST) {
    // default logger with no transports (so silent).
    return winston.createLogger({ transports: [] });
  }
  // This is a "fake" formatter; it doesn't change the message at all,
  // but instead counts the message using metrics_recorder (Prometheus).
  // This only gets used when NODE_ENV is production, and only gets
  // setup for hubs.
  const metrics = format((info, _opts) => {
    counter?.labels(name, `${info.level}`).inc(1);
    return info;
  });

  const myFormatter = printf(({ level, message, timestamp }) => {
    // the name= part is to make this easier to grep
    return `${timestamp} - ${level}: [name=${name}] ${message}`;
  });

  try {
    let transports;
    if (process.env.COCALC_DOCKER) {
      const filename = join("/var/log/hub", "%DATE%.log");
      const f = combine(timestamp(), colorize(), myFormatter);
      transports = [
        new winston.transports.DailyRotateFile({
          // write debug and higher messages to these files
          filename,
          datePattern: "YYYY-MM-DD-HH",
          zippedArchive: true,
          maxSize: "200m",
          maxFiles: "7d",
          format: f,
          options: { flags: "w" },
          level: "debug", // or "silly" for everything
        }),
      ];
    } else if (process.env.NODE_ENV == "production") {
      // For now, just fall back to what we've done forever (console logging),
      // since our infrastructure (Kubernetes) assumes that.
      transports = [
        new winston.transports.Console({
          format: combine(metrics(), timestamp(), colorize(), myFormatter),
          level: "debug",
        }),
      ];
    } else {
      const filename = join(logs, "log");
      const f = combine(timestamp(), colorize(), myFormatter);
      transports = [
        new winston.transports.Console({
          // show info and higher messages to the console
          // Format first adds in a timestamp, then uses the custom
          // formatter defined above.
          format: f,
          level: "info", // for us, info is NOT very verbose -- important since writing to console log blocks
        }),
        new winston.transports.File({
          filename,
          format: f,
          options: { flags: "w" },
          level: "debug", // or "silly" for everything
        }),
      ];
      showConfig(filename);
    }
    return winston.createLogger({ transports });
  } catch (err) {
    if (!hasShownError) {
      hasShownError = true;
      console.warn(`Issue creating logger -- ${err}; using console fallback`);
    }
    const transports = [
      new winston.transports.Console({
        format: combine(metrics(), timestamp(), colorize(), myFormatter),
        level: "debug",
      }),
    ];
    return winston.createLogger({ transports });
  }
}

let done = false;
function showConfig(filename: string) {
  if (done) return true; // only show this message once.
  done = true;
  console.log("\n*************************\n");
  console.log(`Logging info to the console and debug to '${filename}'`);
  console.log("\n*************************\n");
}

// Also make the function the default export.
export default getLogger;
