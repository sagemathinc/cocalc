import { join } from "path";
import * as winston from "winston";
import "winston-daily-rotate-file"; // makes DailyRotateFile available
const { format } = winston;
const { colorize, combine, printf, timestamp } = format;

import { logs } from "smc-util-node/data";

const metrics_recorder = require("./metrics-recorder");

let number = 0;
function new_name() {
  number += 1;
  return `log-${number}`;
}

// one metric for all WinstonMetrics instances (instead, they have a name and the level!)
const counter = metrics_recorder.new_counter(
  "log_lines_total",
  "counts the number of printed log lines",
  ["name", "level"]
);

// get_logger is just a convenience function, which does what we usually do for each component
// it's a drop-in replacement, use it like: winston = require('...').get_logger(<name>)
export function get_logger(name?: string) {
  if (process.env.SMC_TEST) {
    return winston; // default logger with no transports (so silent).
  }
  name = name ?? new_name();

  // This is a "fake" formatter; it doesn't change the message at all,
  // but instead counts the message using metrics_recorder.
  const metrics = format((info, _opts) => {
    counter.labels(name, `${info.level}`).inc(1);
    return info;
  });

  const transports = [
    new winston.transports.Console({
      // show debug and higher messages to the console
      // Format first adds in a timestamp, then uses the custom
      // formatter defined above.
      format: combine(
        metrics(),
        timestamp(),
        colorize(),
        printf(({ level, message, timestamp }) => {
          return `${timestamp} - ${level}: [${name}] ${message}`;
        })
      ),
      level: "debug",
    }),
    // another logger that logs to files and doesn't waste all the disk space.
    new winston.transports.DailyRotateFile({
      // write debug and higher messages to a file
      filename: join(logs, "hub", "%DATE%.log"),
      datePattern: "YYYY-MM-DD-HH",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "7d",
      format: combine(
        timestamp(),
        printf(({ level, message, timestamp }) => {
          return `${timestamp} - ${level}: [name=${name}] ${message}`;
        })
      ),
      level: "debug",
    }),
  ];
  return winston.createLogger({ transports });
}

// Also make the function the default export.<strong></strong>""
export default get_logger;
