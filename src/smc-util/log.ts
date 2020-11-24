/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare var window;

import { RUNNING_IN_NODE, seconds2hms } from "./misc";

let smc_logger_timestamp, smc_logger_timestamp_last, smc_start_time;
smc_logger_timestamp = smc_logger_timestamp_last = smc_start_time =
  new Date().getTime() / 1000.0;

export const get_start_time_ts = () => new Date(smc_start_time * 1000);

export const get_uptime = () =>
  seconds2hms(new Date().getTime() / 1000.0 - smc_start_time);

export function log(..._args): void {
  smc_logger_timestamp = new Date().getTime() / 1000.0;
  const t = seconds2hms(smc_logger_timestamp - smc_start_time);
  const dt = seconds2hms(smc_logger_timestamp - smc_logger_timestamp_last);
  // support for string interpolation for the actual console.log
  const [msg, ...args] = Array.from(Array.prototype.slice.call(arguments));
  let prompt = `[${t} Δ ${dt}]`;
  if (typeof msg == "string") {
    prompt = `${prompt} ${msg}`;
    (console as any).log_original(prompt, ...Array.from(args));
  } else {
    (console as any).log_original(prompt, msg, ...Array.from(args));
  }
  smc_logger_timestamp_last = smc_logger_timestamp;
}

export function wrap_log(): void {
  if (!RUNNING_IN_NODE && window != null) {
    (window.console as any).log_original = window.console.log;
    window.console.log = log;
  }
}
