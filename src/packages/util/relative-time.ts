/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// ATTENTION/TODO: this is deprecated -- we no longer do any clock sync and server_time()
// is just the time!!!  **This is still called in various places.**  The historical reason 
// for tracking server time was for the sync algorithm. However, we replaced it by a better 
// one and no longer worry about server time.  Just a heads up!


declare var window;

function getSkew(): number {
  // this code is shared between frontend and backend. Hence we don't use a local storage wrapper.
  if (typeof window != "undefined" && window.localStorage != null) {
    try {
      const val = window.localStorage.getItem("clock_skew");
      return parseFloat(val ?? "0");
    } catch {
      return 0;
    }
  } else {
    return 0;
  }
}

// Specific, easy to read: describe amount of time before right now
// Use negative input for after now (i.e., in the future).
export function milliseconds_ago(ms): Date {
  return new Date(Date.now() - ms);
}
export function seconds_ago(s): Date {
  return milliseconds_ago(1000 * s);
}
export function minutes_ago(m): Date {
  return seconds_ago(60 * m);
}
export function hours_ago(h): Date {
  return minutes_ago(60 * h);
}
export function days_ago(d): Date {
  return hours_ago(24 * d);
}
export function weeks_ago(w): Date {
  return days_ago(7 * w);
}
export function months_ago(m): Date {
  return days_ago(30.5 * m);
}

export function server_time(): Date {
  if (typeof window != "undefined") {
    return new Date(Date.now() - getSkew());
  } else {
    // On the server, we assume that the server clocks are sufficiently
    // accurate.  Providing these functions makes it simpler to write code
    // that runs on both the frontend and the backend.
    return new Date();
  }
}

export function server_milliseconds_ago(ms: number): Date {
  if (typeof window != "undefined") {
    return new Date(Date.now() - ms - getSkew());
  } else {
    return milliseconds_ago(ms);
  }
}

export function server_seconds_ago(s): Date {
  return server_milliseconds_ago(1000 * s);
}
export function server_minutes_ago(m): Date {
  return server_seconds_ago(60 * m);
}
export function server_hours_ago(h): Date {
  return server_minutes_ago(60 * h);
}
export function server_days_ago(d): Date {
  return server_hours_ago(24 * d);
}
export function server_weeks_ago(w): Date {
  return server_days_ago(7 * w);
}
export function server_months_ago(m): Date {
  return server_days_ago(30.5 * m);
}

// Specific easy to read and describe point in time before another point in time tm.
// (The following work exactly as above if the second argument is excluded.)
// Use negative input for first argument for that amount of time after tm.
export function milliseconds_before(ms, tm) {
  return new Date((tm ?? new Date()).valueOf() - ms);
}
export function seconds_before(s, tm) {
  return milliseconds_before(1000 * s, tm);
}
export function minutes_before(m, tm) {
  return seconds_before(60 * m, tm);
}
export function hours_before(h, tm) {
  return minutes_before(60 * h, tm);
}
export function days_before(d, tm) {
  return hours_before(24 * d, tm);
}
export function weeks_before(d, tm) {
  return days_before(7 * d, tm);
}
export function months_before(d, tm) {
  return days_before(30.5 * d, tm);
}

// time this many seconds in the future (or undefined)
export function expire_time(s: number): Date {
  // @ts-ignore: due to possible non-TS clients
  if (s == null) return;
  return new Date(Date.now() + s * 1000);
}

export const YEAR = new Date().getFullYear();
