/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "./types";
import centralLog from "./central-log";
import os from "os";

export interface GetLogOptions {
  start?: Date; // if not given start at beginning of time
  end?: Date; // if not given include everything until now
  log?: string; // which table to query, defaults to 'central_log'
  event?: string; // filter by event type
  where?: object; // JSONB containment filter, e.g., {account_id:'...'}
}

export interface LogEntry {
  id: string;
  event: string;
  value: any;
  time: Date;
  expire?: Date;
  error?: string;
  account_id?: string;
}

/**
 * Dump a range of data from the central_log table (or other log table).
 * Returns an array of log entries matching the specified filters.
 */
export async function get_log(
  db: PostgreSQL,
  opts: GetLogOptions,
): Promise<LogEntry[]> {
  const log = opts.log ?? "central_log";

  const { rows } = await callback2(db._query.bind(db), {
    query: `SELECT * FROM ${log}`,
    where: {
      "time >= $::TIMESTAMP": opts.start,
      "time <= $::TIMESTAMP": opts.end,
      "event = $::TEXT": opts.event,
      "value @> $::JSONB": opts.where,
    },
  });

  return rows;
}

export interface GetUserLogOptions {
  start?: Date;
  end?: Date; // if not given include everything until now
  event?: string; // defaults to 'successful_sign_in'
  account_id: string;
}

/**
 * Return every entry x in central_log in the given period of time for
 * which x.event==event and x.value.account_id == account_id.
 */
export async function get_user_log(
  db: PostgreSQL,
  opts: GetUserLogOptions,
): Promise<LogEntry[]> {
  const event = opts.event ?? "successful_sign_in";

  return await get_log(db, {
    start: opts.start,
    end: opts.end,
    event,
    where: { account_id: opts.account_id },
  });
}

/**
 * Call when things go to hell in some unexpected way; at least
 * we attempt to record this in the database.
 *
 * CRITICAL: This function must never throw an exception, since if it
 * did then we would hit a horrible infinite loop!
 */
export async function uncaught_exception(
  _db: PostgreSQL,
  err: Error | string,
): Promise<void> {
  try {
    const errorStr = typeof err === "string" ? err : `${err}`;
    const stack = typeof err === "object" && err.stack ? `${err.stack}` : "";

    await centralLog({
      event: "uncaught_exception",
      value: {
        error: errorStr,
        stack,
        host: os.hostname(),
      },
    });
  } catch (e) {
    // IT IS CRITICAL THAT uncaught_exception not raise an exception, since if it
    // did then we would hit a horrible infinite loop!
    // Silently fail
  }
}

export interface LogClientErrorOptions {
  event?: string; // defaults to 'event'
  error?: string; // defaults to 'error'
  account_id?: string;
}

/**
 * Log a client-side error to the client_error_log table.
 * Entries expire after 30 days.
 */
export async function log_client_error(
  db: PostgreSQL,
  opts: LogClientErrorOptions,
): Promise<void> {
  const { expire_time, uuid } = await import("@cocalc/util/misc");

  await callback2(db._query.bind(db), {
    query: "INSERT INTO client_error_log",
    values: {
      "id :: UUID": uuid(),
      "event :: TEXT": opts.event ?? "event",
      "error :: TEXT": opts.error ?? "error",
      "account_id :: UUID": opts.account_id,
      "time :: TIMESTAMP": "NOW()",
      "expire :: TIMESTAMP": expire_time(30 * 24 * 60 * 60),
    },
  });
}

export interface WebappErrorOptions {
  account_id?: string;
  name?: string;
  message?: string;
  comment?: string;
  stacktrace?: string;
  file?: string;
  path?: string;
  lineNumber?: number;
  columnNumber?: number;
  severity?: string;
  browser?: string;
  mobile?: boolean;
  responsive?: boolean;
  user_agent?: string;
  smc_version?: string;
  build_date?: string;
  smc_git_rev?: string;
  uptime?: string;
  start_time?: Date;
}

/**
 * Log a webapp error to the webapp_errors table.
 * Entries expire after 30 days.
 */
export async function webapp_error(
  db: PostgreSQL,
  opts: WebappErrorOptions,
): Promise<void> {
  const { expire_time, uuid } = await import("@cocalc/util/misc");

  await callback2(db._query.bind(db), {
    query: "INSERT INTO webapp_errors",
    values: {
      "id :: UUID": uuid(),
      "account_id :: UUID": opts.account_id,
      "name :: TEXT": opts.name,
      "message :: TEXT": opts.message,
      "comment :: TEXT": opts.comment,
      "stacktrace :: TEXT": opts.stacktrace,
      "file :: TEXT": opts.file,
      "path :: TEXT": opts.path,
      "lineNumber :: INTEGER": opts.lineNumber,
      "columnNumber :: INTEGER": opts.columnNumber,
      "severity :: TEXT": opts.severity,
      "browser :: TEXT": opts.browser,
      "mobile :: BOOLEAN": opts.mobile,
      "responsive :: BOOLEAN": opts.responsive,
      "user_agent :: TEXT": opts.user_agent,
      "smc_version :: TEXT": opts.smc_version,
      "build_date :: TEXT": opts.build_date,
      "smc_git_rev :: TEXT": opts.smc_git_rev,
      "uptime :: TEXT": opts.uptime,
      "start_time :: TIMESTAMP": opts.start_time,
      "time :: TIMESTAMP": "NOW()",
      "expire :: TIMESTAMP": expire_time(30 * 24 * 60 * 60),
    },
  });
}

export interface GetClientErrorLogOptions {
  start?: Date;
  end?: Date;
  event?: string;
}

/**
 * Retrieve client error log entries.
 * This is a convenience wrapper around get_log that queries the client_error_log table.
 */
export async function get_client_error_log(
  db: PostgreSQL,
  opts: GetClientErrorLogOptions,
): Promise<LogEntry[]> {
  return await get_log(db, {
    ...opts,
    log: "client_error_log",
  });
}
