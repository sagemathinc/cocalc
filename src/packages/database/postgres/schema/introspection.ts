/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Group 2: Schema & Metadata - Database schema introspection

TypeScript implementations of query-based schema introspection methods:
- getTables(db, cb) - Get list of all tables in public schema
- getColumns(db, table, cb) - Get list of columns for a specific table
*/

import type { PostgreSQL } from "../types";

/**
 * Get list of all tables in the public schema
 *
 * Queries information_schema.tables to retrieve all table names in the public schema.
 *
 * @param db - PostgreSQL database instance
 * @param cb - Callback invoked with (err, tables) where tables is an array of table names
 */
export function getTables(
  db: PostgreSQL,
  cb: (err?: string | Error, tables?: string[]) => void,
): void {
  db._query({
    query:
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    cb: (err, result) => {
      if (err) {
        cb(err as string | Error);
      } else if (result) {
        // Extract table_name from each row
        const tables = result.rows.map((row) => row.table_name);
        cb(undefined, tables);
      } else {
        cb("No result returned from query");
      }
    },
  });
}

/**
 * Get list of columns for a specific table
 *
 * Queries information_schema.columns to retrieve all column names for the specified table.
 *
 * @param db - PostgreSQL database instance
 * @param table - Table name to get columns for
 * @param cb - Callback invoked with (err, columns) where columns is an array of column names
 */
export function getColumns(
  db: PostgreSQL,
  table: string,
  cb: (err?: string | Error, columns?: string[]) => void,
): void {
  db._query({
    query: "SELECT column_name FROM information_schema.columns",
    where: {
      "table_name = $::text": table,
    },
    cb: (err, result) => {
      if (err) {
        cb(err as string | Error);
      } else if (result) {
        // Extract column_name from each row
        const columns = result.rows.map((row) => row.column_name);
        cb(undefined, columns);
      } else {
        cb("No result returned from query");
      }
    },
  });
}
