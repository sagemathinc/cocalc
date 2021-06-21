import * as winston from "winston";

// Default is just the no-op winston.
export let logger: winston.Logger | undefined = undefined;

// smc-hub, smc-project, etc., setup their own loggers, then call this.  Then code in
// this library uses the result.
export function setLogger(newLogger: winston.Logger): void {
  logger = newLogger;
}

export function debug(...args) {
  // @ts-ignore
  logger?.debug(...args);
}

export function info(...args) {
  // @ts-ignore
  logger?.info(...args);
}
