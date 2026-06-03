/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { copy, coerce_codomain_to_numbers } from "@cocalc/util/misc";
import { DEFAULT_QUOTAS } from "@cocalc/util/schema";
import type { PostgreSQL } from "../types";

export interface GetProjectSettingsOptions {
  project_id: string;
}

export async function getProjectSettings(
  db: PostgreSQL,
  opts: GetProjectSettingsOptions,
): Promise<any> {
  const { rows } = await db.async_query({
    query: "SELECT settings FROM projects",
    where: { "project_id = $::UUID": opts.project_id },
  });

  if (!rows || rows.length === 0 || !rows[0].settings) {
    // No settings found - return a copy of DEFAULT_QUOTAS
    return copy(DEFAULT_QUOTAS);
  }

  // Coerce string values to numbers (e.g., "2048" -> 2048)
  const settings = coerce_codomain_to_numbers(rows[0].settings);

  // Merge with DEFAULT_QUOTAS (use setting value if present, otherwise use default)
  const quotas: any = {};
  for (const key in DEFAULT_QUOTAS) {
    quotas[key] =
      settings[key] !== null && settings[key] !== undefined
        ? settings[key]
        : DEFAULT_QUOTAS[key];
  }

  return quotas;
}

export interface SetProjectSettingsOptions {
  project_id: string;
  settings: any; // can be any subset of the quotas map
}

export async function setProjectSettings(
  db: PostgreSQL,
  opts: SetProjectSettingsOptions,
): Promise<void> {
  await db.async_query({
    query: "UPDATE projects",
    where: { "project_id = $::UUID": opts.project_id },
    jsonb_merge: { settings: opts.settings },
  });
}
