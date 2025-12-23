/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { SCHEMA } from "@cocalc/util/schema";

/**
 * Type for backup table selection
 * - string[]: explicit list of tables
 * - "all": all non-virtual tables in the schema
 * - "critical": critical tables (excludes logs, stats, etc.)
 * - string: single table name
 */
export type BackupTables = string[] | "all" | "critical" | string;

/**
 * Tables that are NOT critical for disaster recovery.
 * These tables contain:
 * - Analytics, metrics, and usage tracking
 * - Caches and temporary data
 * - Large blobs and file content
 * - Real-time sync data that can be regenerated
 * - Cursor positions and patches
 *
 * Note: Tables with 'log' in the name are also excluded (handled separately).
 *
 * TODO: This should probably be in the schema itself, not here.
 */
export const NON_CRITICAL_TABLES = [
  // Analytics, metrics, and usage tracking
  "analytics",
  "stats",
  "usage_info",
  "cloud_filesystem_metrics",
  "user_tracking",

  // Caches
  "compute_servers_cache",
  "jupyter_api_cache",
  "openai_embedding_cache",

  // Large blob storage (can be backed up separately)
  "blobs",

  // Real-time sync data (can be regenerated)
  "syncstrings",
  "patches",
  "cursors",

  // Evaluation data (can be regenerated)
  "eval_inputs",
  "eval_outputs",

  // File usage tracking
  "file_use",

  // Temporary/ephemeral data
  "ipywidgets",
  "mentions",
  "shopping_cart_items",

  // Error logs (separate from other logs which are caught by name filter)
  "webapp_errors",
] as const;

/**
 * Get the list of tables to backup based on the input parameter.
 *
 * @param tables - Can be:
 *   - An array of table names (returned as-is)
 *   - "all" - returns all non-virtual tables from SCHEMA
 *   - "critical" - returns important tables (excludes logs and non-critical tables)
 *   - A single table name (wrapped in an array)
 * @returns Array of table names to backup
 */
export function getBackupTables(tables: BackupTables): string[] {
  // If already an array, return as-is
  if (Array.isArray(tables)) {
    return tables;
  }

  // Get all non-virtual tables from schema
  const allTables = Object.keys(SCHEMA).filter((t) => !SCHEMA[t].virtual);

  if (tables === "all") {
    return allTables;
  }

  if (tables === "critical") {
    return allTables.filter((table) => {
      // Exclude tables with 'log' in the name
      if (table.includes("log")) {
        return false;
      }
      // Exclude tables in the non-critical list
      if ((NON_CRITICAL_TABLES as readonly string[]).includes(table)) {
        return false;
      }
      return true;
    });
  }

  // Single table name - wrap in array
  return [tables];
}

/**
 * Callback version of getBackupTables for backward compatibility with CoffeeScript.
 * This wrapper is used during the migration phase.
 */
export function getBackupTablesCB(tables: BackupTables): string[] {
  return getBackupTables(tables);
}
