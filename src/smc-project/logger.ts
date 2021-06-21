/*
Winston logger for a CoCalc project.

There is a similar logger, but with different parameters, in smc-hub.
*/

import { join } from "path";
import * as winston from "winston";
import "winston-daily-rotate-file"; // makes DailyRotateFile available
const { format } = winston;
const { colorize, combine, printf, timestamp } = format;

// get_logger is just a convenience function, which does what we usually do for each component
// it's a drop-in replacement, use it like: winston = require('...').get_logger(<name>)
export function get_logger(name: string) {
  if (!process.env.SMC) {
    throw Error("SMC env var *must* be defined");
  }
  const log_path = join(process.env.SMC, "logs");

  const myFormatter = printf(({ level, message, timestamp }) => {
    return `${timestamp} - ${level}: [name=${name}] ${message}`;
  });

  let transports;
  if (process.env.NODE_ENV == "production") {
    // For now, just fall back to what we've done forever (console logging),
    // since our infrastructure assumes that.
    transports = [
      new winston.transports.Console({
        format: combine(timestamp(), colorize(), myFormatter),
        level: "debug",
      }),
    ];
  } else {
    const filename = join(log_path, "%DATE%.log");

    transports = [
      // TODO: "writing to console in production is bad practice, because it is blocking!" x2 --
      // says author of winston at about 16 minutes into https://youtu.be/uPw7QIx3JZM
      new winston.transports.Console({
        format: combine(timestamp(), colorize(), myFormatter),
        level: "info",
      }),
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
  if (done) return true;
  done = true;
  console.log(`Logging info to the console and debug to '${filename}'`);
}

// Also make the function the default export.<strong></strong>""
export default get_logger;

// Set what logger is used by code in certain other libraries.
import { setLogger } from "smc-util-node/logger";
setLogger(get_logger("smc-project"));
