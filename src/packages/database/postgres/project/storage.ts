/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

export interface SetProjectStorageOptions {
  project_id: string;
  host: string;
}

export async function setProjectStorage(
  db: PostgreSQL,
  opts: SetProjectStorageOptions,
): Promise<Date> {
  // Get current storage to check if host change is being attempted
  const current = await new Promise<any>((resolve, reject) => {
    db._get_project_column("storage", opts.project_id, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });

  // Check if trying to change storage host to a different value
  if (current?.host != null && current.host !== opts.host) {
    throw new Error(
      "change storage not implemented yet -- need to implement saving previous host",
    );
  }

  // Easy case - assigning for the first time or reassigning same host
  const assigned = new Date();

  await db.async_query({
    query: "UPDATE projects",
    jsonb_set: {
      storage: { host: opts.host, assigned },
    },
    where: { "project_id :: UUID = $": opts.project_id },
  });

  return assigned;
}

export interface GetProjectStorageOptions {
  project_id: string;
}

export async function getProjectStorage(
  db: PostgreSQL,
  opts: GetProjectStorageOptions,
): Promise<any> {
  return await new Promise((resolve, reject) => {
    db._get_project_column("storage", opts.project_id, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

export interface UpdateProjectStorageSaveOptions {
  project_id: string;
}

export async function updateProjectStorageSave(
  db: PostgreSQL,
  opts: UpdateProjectStorageSaveOptions,
): Promise<void> {
  await db.async_query({
    query: "UPDATE projects",
    jsonb_merge: {
      storage: { saved: new Date() },
    },
    where: { "project_id :: UUID = $": opts.project_id },
  });
}
