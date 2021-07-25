/*
Deubg logger for any node.js server.

There is used both by the hub(s) and project(s).

This is an implementation of basically how winston works for us,
but using the vastly simpler super-popular debug module.
*/

import debug, { Debugger } from "debug";
import { appendFile, mkdirSync, writeFileSync } from "fs";
import { format } from "util";
import { dirname, join } from "path";
import { logs } from "./data";

process.env.DEBUG_HIDE_DATE = "yes"; // since we supply it ourselves
const COCALC = debug("cocalc");

function myFormat(...args): string {
  if (args.length > 1 && typeof args[0] == "string" && !args[0].includes("%")) {
    // This is something where we didn't use printf formatting.
    const v: string[] = [];
    for (const x of args) {
      try {
        v.push(typeof x == "object" ? JSON.stringify(x) : `${x}`);
      } catch (_) {
        // better to not crash everything just for logging
        v.push(`${x}`);
      }
    }
    return v.join(" ");
  }
  // use printf formatting.
  return format(...args);
}

function defaultTransports(): { console?: boolean; file?: string } {
  if (process.env.SMC_TEST) {
    return {};
  } else if (process.env.COCALC_DOCKER) {
    return { file: "/var/log/hub/log" };
  } else if (process.env.NODE_ENV == "production") {
    return { console: true };
  } else {
    return { file: join(logs, "log") };
  }
}

function initTransports() {
  if (!process.env.DEBUG) {
    // if DEBUG isn't set then the debug logger will be silent anyways.
    return;
  }
  const transports = defaultTransports();
  if (process.env.DEBUG_CONSOLE != null) {
    transports.console =
      process.env.DEBUG_CONSOLE != "no" && process.env.DEBUG_CONSOLE != "false";
  }
  if (process.env.DEBUG_FILE != null) {
    transports.file = process.env.DEBUG_FILE;
  }
  if (transports.file) {
    // ensure directory exists
    mkdirSync(dirname(transports.file), { recursive: true });
    // clear the file
    writeFileSync(transports.file, "");
  }
  let firstLog: boolean = true;
  COCALC.log = (...args) => {
    if (!transports.file && !transports.console) return;
    if (firstLog && transports.file) {
      console.error(
        `***\n\nLogging to "${transports.file}"${
          transports.console ? " and console.error" : ""
        } via the debug module\nwith  DEBUG='${
          process.env.DEBUG
        }'.\nUse   DEBUG_FILE='path' and DEBUG_CONSOLE=[yes|no] to override.\nUsing DEBUG='cocalc:*,-cocalc:silly:*' to control log levels.\n\n***`
      );
      firstLog = false;
    }
    // Similar as in debug source code, except I stuck a timestamp
    // at the beginning, which I like... except also aware of
    // non-printf formating.
    const line = `${new Date().toISOString()}: ${myFormat(...args)}\n`;

    if (transports.console) {
      // the console transport:
      console.error(line);
    }
    if (transports.file) {
      // the file transport
      appendFile(transports.file, line, () => {});
    }
  };
}

initTransports();

const DEBUGGERS = {
  error: COCALC.extend("error"),
  warn: COCALC.extend("warn"),
  info: COCALC.extend("info"),
  http: COCALC.extend("http"),
  verbose: COCALC.extend("verbose"),
  debug: COCALC.extend("debug"),
  silly: COCALC.extend("silly"),
};

type Level = keyof typeof DEBUGGERS;

const LEVELS: Level[] = [
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
];

class Logger {
  private name: string;
  private debuggers: { [level: string]: Debugger } = {};

  constructor(name: string) {
    this.name = name;
    for (const level of LEVELS) {
      this.debuggers[level] = DEBUGGERS[level].extend(name);
      this[level] = (...args) => {
        this.counter("error");
        // @ts-ignore
        this.debuggers[level](...args);
      };
    }
  }

  private counter(level: string): void {
    if (counter == null) return;
    counter.labels(this.name, level).inc(1);
  }
}

interface WinstonLogger {
  error: Function;
  warn: Function;
  info: Function;
  http: Function;
  verbose: Function;
  debug: Function;
  silly: Function;
}

const cache: { [name: string]: WinstonLogger } = {};
export default function getLogger(name: string): WinstonLogger {
  if (cache[name] != null) {
    return cache[name];
  }
  // smash it over since we build Logger pretty generically so typescript
  // doesn't get it.  But we care that all *client* code uses the WinstonLogger
  // interface.
  return (cache[name] = new Logger(name) as unknown as WinstonLogger);
}

export { getLogger };

let counter: any = undefined;
export function setCounter(f) {
  counter = f;
}

/*
import { join } from "path";

import * as winston from "winston";
import "winston-daily-rotate-file"; // makes DailyRotateFile available
const { format } = winston;
const { colorize, combine, printf, timestamp } = format;
import { logs } from "./data";
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
*/
