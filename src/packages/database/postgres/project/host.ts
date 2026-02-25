/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

export interface SetProjectHostOptions {
  project_id: string;
  host: string;
}

export async function setProjectHost(
  db: PostgreSQL,
  opts: SetProjectHostOptions,
): Promise<Date> {
  const assigned = new Date();

  await db.async_query({
    query: "UPDATE projects",
    jsonb_set: {
      host: { host: opts.host, assigned },
    },
    where: { "project_id :: UUID = $": opts.project_id },
  });

  return assigned;
}

export interface UnsetProjectHostOptions {
  project_id: string;
}

export async function unsetProjectHost(
  db: PostgreSQL,
  opts: UnsetProjectHostOptions,
): Promise<void> {
  await db.async_query({
    query: "UPDATE projects",
    set: {
      host: null,
    },
    where: { "project_id :: UUID = $": opts.project_id },
  });
}

export interface GetProjectHostOptions {
  project_id: string;
}

export async function getProjectHost(
  db: PostgreSQL,
  opts: GetProjectHostOptions,
): Promise<string | undefined> {
  const { rows } = await db.async_query({
    query: "SELECT host#>>'{host}' AS host FROM projects",
    where: { "project_id :: UUID = $": opts.project_id },
  });

  if (!rows || rows.length === 0) {
    return undefined;
  }

  const host = rows[0].host;
  // SQL returns null for missing values, but we want undefined
  return host ?? undefined;
}
