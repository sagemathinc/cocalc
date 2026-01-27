/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { AllSiteSettings } from "@cocalc/util/db-schema/types";
import { callback2 } from "@cocalc/util/async-utils";
import { db } from "@cocalc/database";
import type { PostgreSQL } from "../types";
import {
  getServerSettings,
  resetServerSettingsCache,
} from "@cocalc/database/settings/server-settings";
import { site_settings_conf } from "@cocalc/util/schema";
import { keys } from "@cocalc/util/misc";

// just to make this async friendly, that's all
export async function get_server_settings(): Promise<AllSiteSettings> {
  return await callback2(db().get_server_settings_cached);
}

export interface SetServerSettingOptions {
  name: string;
  value: string;
  readonly?: boolean;
}

/**
 * Set a server setting in the database.
 * Also updates the _last_update timestamp and clears the cache.
 */
export async function set_server_setting(
  db: PostgreSQL,
  opts: SetServerSettingOptions,
): Promise<void> {
  // Insert the setting
  const values: any = {
    "name::TEXT": opts.name,
    "value::TEXT": opts.value,
  };
  if (opts.readonly != null) {
    values.readonly = !!opts.readonly;
  }

  await callback2(db._query.bind(db), {
    query: "INSERT INTO server_settings",
    values,
    conflict: "name",
  });

  // Set the _last_update timestamp
  await callback2(db._query.bind(db), {
    query: "INSERT INTO server_settings",
    values: {
      "name::TEXT": "_last_update",
      "value::TEXT": new Date().toISOString(),
    },
    conflict: "name",
  });

  // Clear the cache
  resetServerSettingsCache();
}

export interface GetServerSettingOptions {
  name: string;
}

/**
 * Get a single server setting value by name.
 * Returns undefined if the setting doesn't exist.
 */
export async function get_server_setting(
  db: PostgreSQL,
  opts: GetServerSettingOptions,
): Promise<string | undefined> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT value FROM server_settings",
    where: {
      "name = $::TEXT": opts.name,
    },
  });

  if (rows.length === 0) {
    return undefined;
  }

  const value = rows[0]?.value;
  return value ?? undefined;
}

/**
 * Get all server settings from cache.
 * This is a wrapper around getServerSettings from @cocalc/database/settings/server-settings.
 */
export async function get_server_settings_cached(): Promise<any> {
  return await getServerSettings();
}

/**
 * Get site-specific settings (subset of server settings).
 * Returns an object mapping setting names to values.
 */
export async function get_site_settings(db: PostgreSQL): Promise<any> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT name, value FROM server_settings",
    cache: true,
    where: {
      "name = ANY($)": keys(site_settings_conf),
    },
  });

  const result: any = {};
  for (const row of rows) {
    let value = row.value;
    // Backward compatibility: convert string 'true'/'false' to boolean for 'commercial' setting
    if (row.name === "commercial" && (value === "true" || value === "false")) {
      value = value === "true";
    }
    result[row.name] = value;
  }

  return result;
}

/**
 * Create a synctable for server_settings.
 * This allows real-time synchronization of server settings.
 */
export function server_settings_synctable(db: PostgreSQL, opts: any = {}): any {
  return db.synctable({ ...opts, table: "server_settings" });
}

/**
 * Reset the server settings cache.
 * This is a convenience wrapper around resetServerSettingsCache.
 */
export function reset_server_settings_cache(): void {
  resetServerSettingsCache();
}
