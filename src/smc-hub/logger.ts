/*
Winston logger for a hub server.

There is a similar logger, but with different parameters, in smc-project.
*/

import { join } from "path";
import * as winston from "winston";
import "winston-daily-rotate-file"; // makes DailyRotateFile available
const { format } = winston;
const { colorize, combine, printf, timestamp } = format;
import { logs } from "smc-util-node/data";

const metrics_recorder = require("./metrics-recorder");

// one metric for all WinstonMetrics instances (instead, they have a name and the level!)
const counter = metrics_recorder.new_counter(
  "log_lines_total",
  "counts the number of printed log lines",
  ["name", "level"]
);

// get_logger is just a convenience function, which does what we usually do for each component
// it's a drop-in replacement, use it like: winston = require('...').get_logger(<name>)
export function get_logger(name: string): winston.Logger {
  if (process.env.SMC_TEST) {
    // default logger with no transports (so silent).
    return winston.createLogger({ transports: [] });
  }
  // This is a "fake" formatter; it doesn't change the message at all,
  // but instead counts the message using metrics_recorder.
  const metrics = format((info, _opts) => {
    counter.labels(name, `${info.level}`).inc(1);
    return info;
  });

  const myFormatter = printf(({ level, message, timestamp }) => {
    // the name= part is to make this easier to grep
    return `${timestamp} - ${level}: [name=${name}] ${message}`;
  });

  let transports;
  if (process.env.NODE_ENV == "production") {
    // For now, just fall back to what we've done forever (console logging),
    // since our infrastructure assumes that.
    transports = [
      new winston.transports.Console({
        format: combine(metrics(), timestamp(), colorize(), myFormatter),
        level: "debug",
      }),
    ];
  } else {
    const filename = join(logs, "hub", "%DATE%.log");
    transports = [
      new winston.transports.Console({
        // show info and higher messages to the console
        // Format first adds in a timestamp, then uses the custom
        // formatter defined above.
        format: combine(metrics(), timestamp(), colorize(), myFormatter),
        level: "info", // for us, info is NOT very verbose -- important since writing to console log blocks
      }),
      // another logger that logs to files and doesn't waste all the disk space.
      new winston.transports.DailyRotateFile({
        // write debug and higher messages to a file
        filename,
        datePattern: "YYYY-MM-DD-HH",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "7d",
        format: combine(timestamp(), colorize(), myFormatter),
        level: "debug",
      }),
    ];
    showConfig(filename);
  }
  return winston.createLogger({ transports });
}

let done = false;
function showConfig(filename: string) {
  if (done) return true; // only show this message once.
  done = true;
  console.log("\n*************************\n");
  console.log(`Logging info to the console and debug to '${filename}'`);
  console.log("\n*************************\n");
}

// Also make the function the default export.<strong></strong>""
export default get_logger;

import { setLogger } from "smc-util-node/logger";
setLogger(get_logger("smc-hub"));
