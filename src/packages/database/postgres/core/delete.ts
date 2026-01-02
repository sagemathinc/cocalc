/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 3b: Delete Operations

TypeScript implementations of database deletion methods:
- deleteExpired(db, opts, cb) - Delete expired entries from tables
- deleteAll(db, opts, cb) - Delete all data from all tables
- deleteEntireDatabase(db, opts, cb) - Drop entire database

These are destructive operations requiring careful confirmation.
*/

import type { PostgreSQL } from "../types";
import { defaults, required } from "@cocalc/util/misc";
import { SCHEMA } from "@cocalc/util/db-schema";
import * as misc_node from "@cocalc/backend/misc_node";

const async = require("async");

interface DeleteExpiredOpts {
  count_only?: boolean; // If true, only count rows that would be deleted
  table?: string; // Only delete from this table
  cb: (err?: string | Error) => void;
}

interface DeleteAllOpts {
  confirm?: string; // Must be 'yes' to proceed
  cb: (err?: string | Error) => void;
}

interface DeleteEntireDatabaseOpts {
  confirm?: string; // Must be 'yes' to proceed
  cb: (err?: string | Error) => void;
}

interface ConfirmDeleteOpts {
  confirm?: string;
  cb: (err?: string | Error) => void;
}

/**
 * Helper function to confirm destructive delete operations
 *
 * @param opts - Options with confirm field and callback
 * @returns true if confirmed, false otherwise (also calls callback with error)
 */
function confirmDelete(opts: ConfirmDeleteOpts): boolean {
  const optsWithDefaults = defaults(opts, {
    confirm: "no",
    cb: required,
  });

  if (optsWithDefaults.confirm !== "yes") {
    const err = `Really delete all data? -- you must explicitly pass in confirm='yes' (but confirm:'${optsWithDefaults.confirm}')`;
    optsWithDefaults.cb(err);
    return false;
  }
  return true;
}

/**
 * Delete expired entries from tables with expire timestamp column
 *
 * Queries SCHEMA to find all tables with 'expire' timestamp field,
 * then deletes entries where expire <= NOW().
 *
 * @param db - PostgreSQL database instance
 * @param opts - Options with count_only, table, and callback
 */
export function deleteExpired(db: PostgreSQL, opts: DeleteExpiredOpts): void {
  const optsWithDefaults = defaults(opts, {
    count_only: false,
    table: undefined,
    cb: required,
  });

  // Function to process a single table
  const processTable = (table: string, tableCb: (err?: any) => void) => {
    if (optsWithDefaults.count_only) {
      // Count mode: just count rows that would be deleted
      db._query({
        query: `SELECT COUNT(*) FROM ${table} WHERE expire <= NOW()`,
        cb: (err) => {
          // Note: CoffeeScript version logged counts via dbg()
          // We omit logging here for cleaner output
          tableCb(err);
        },
      });
    } else {
      // Delete mode: actually delete expired entries
      db._query({
        query: `DELETE FROM ${table} WHERE expire <= NOW()`,
        cb: (err) => {
          tableCb(err);
        },
      });
    }
  };

  // Determine which tables to process
  let tables: string[];
  if (optsWithDefaults.table) {
    // Single table specified
    tables = [optsWithDefaults.table];
  } else {
    // Find all tables with 'expire' timestamp field
    tables = [];
    for (const [tableName, tableSchema] of Object.entries(SCHEMA)) {
      if (
        tableSchema.fields?.expire?.type === "timestamp" &&
        !tableSchema.virtual
      ) {
        tables.push(tableName);
      }
    }
  }

  // Process all tables in parallel
  async.map(tables, processTable, optsWithDefaults.cb);
}

/**
 * Delete all data from all tables in the database
 *
 * DESTRUCTIVE: Deletes all table contents but keeps schema intact.
 * Requires confirmation='yes' to proceed.
 *
 * @param db - PostgreSQL database instance
 * @param opts - Options with confirm and callback
 */
export function deleteAll(db: PostgreSQL, opts: DeleteAllOpts): void {
  const optsWithDefaults = defaults(opts, {
    confirm: "no",
    cb: required,
  });

  // Confirm destructive operation
  if (!confirmDelete(optsWithDefaults)) {
    return; // Error already sent via callback
  }

  // Clear cache if enabled
  if (typeof db.clear_cache === "function") {
    db.clear_cache();
  }

  // Delete cached stats
  delete db._stats_cached;

  let tables: string[];

  async.series(
    [
      // Step 1: Get list of all tables
      (stepCb) => {
        db._get_tables((err, t) => {
          if (err) {
            stepCb(err);
          } else if (t) {
            tables = t;
            stepCb(undefined);
          } else {
            stepCb("No tables returned");
          }
        });
      },
      // Step 2: Delete all data from each table
      (stepCb) => {
        const deleteFromTable = (
          table: string,
          tableCb: (err?: any) => void,
        ) => {
          db._query({
            query: `DELETE FROM ${table}`,
            cb: tableCb,
          } as any); // safety_check not in type definition but exists in implementation
        };
        async.map(tables, deleteFromTable, stepCb);
      },
    ],
    optsWithDefaults.cb,
  );
}

/**
 * Drop the entire database using dropdb command
 *
 * EXTREMELY DESTRUCTIVE: Drops the entire database.
 * Requires confirmation='yes' to proceed.
 * Will fail if other clients have the database open.
 *
 * @param db - PostgreSQL database instance
 * @param opts - Options with confirm and callback
 */
export function deleteEntireDatabase(
  db: PostgreSQL,
  opts: DeleteEntireDatabaseOpts,
): void {
  const optsWithDefaults = defaults(opts, {
    confirm: "no",
    cb: required,
  });

  // Confirm destructive operation
  if (!confirmDelete(optsWithDefaults)) {
    return; // Error already sent via callback
  }

  async.series(
    [
      // Step 1: Disconnect from database
      (stepCb) => {
        db.disconnect();
        stepCb(undefined);
      },
      // Step 2: Execute dropdb command
      (stepCb) => {
        misc_node.execute_code({
          command: "dropdb",
          args: [
            "--host",
            db._host,
            "--port",
            String(db._port),
            db._database,
          ],
          cb: stepCb,
        });
      },
    ],
    optsWithDefaults.cb,
  );
}
