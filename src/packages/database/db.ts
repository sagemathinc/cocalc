/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PostgreSQL } from "./postgres";

// PostgreSQL composition lives in packages/database/postgres.ts to keep the entry point small.

let theDB: PostgreSQL | undefined = undefined;

const hasOptions = (opts: Record<string, unknown>): boolean =>
  Object.keys(opts).length > 0;

export function db(opts: Record<string, unknown> = {}): PostgreSQL {
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
