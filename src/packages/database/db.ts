/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PostgreSQL } from "./postgres";
import type { PostgreSQLOptions } from "./postgres/types";

// PostgreSQL composition lives in packages/database/postgres.ts to keep the entry point small.

let theDB: PostgreSQL | undefined = undefined;

const hasOptions = (opts: PostgreSQLOptions): boolean =>
  Object.keys(opts).length > 0;


/**
 * Return the singleton PostgreSQL instance.
 *
 * @param opts.ensure_exists Only for standalone maintenance scripts; core code
 * should call db() with no arguments and rely on the default behavior.
 */
export function db(opts: { ensure_exists?: boolean } = {}): PostgreSQL {
  if (theDB === undefined) {
    theDB = new PostgreSQL(opts);
  } else if (opts != null && hasOptions(opts)) {
    throw new Error(
      "db() already initialized; pass no options after the singleton exists",
    );
  }

  if (theDB == null) {
    throw new Error("Fatal error setting up PostgreSQL instance");
  }
  return theDB;
}
