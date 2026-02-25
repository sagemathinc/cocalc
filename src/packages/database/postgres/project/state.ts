/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { COMPUTE_STATES } from "@cocalc/util/schema";
import type { PostgreSQL } from "../types";

export interface SetProjectStorageRequestOptions {
  project_id: string;
  action: string; // 'save', 'close', 'open', 'move'
  target?: string; // needed for 'open' and 'move'
}

export async function setProjectStorageRequest(
  db: PostgreSQL,
  opts: SetProjectStorageRequestOptions,
): Promise<void> {
  const x: any = {
    action: opts.action,
    requested: new Date(),
  };

  if (opts.target != null) {
    x.target = opts.target;
  }

  await db.async_query({
    query: "UPDATE projects",
    set: { "storage_request::JSONB": x },
    where: { "project_id :: UUID = $": opts.project_id },
  });
}

export interface GetProjectStorageRequestOptions {
  project_id: string;
}

export async function getProjectStorageRequest(
  db: PostgreSQL,
  opts: GetProjectStorageRequestOptions,
): Promise<any> {
  return await new Promise((resolve, reject) => {
    db._get_project_column("storage_request", opts.project_id, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

export interface SetProjectStateOptions {
  project_id: string;
  state: string;
  time?: Date;
  error?: string;
  ip?: string; // optional ip address
}

export async function setProjectState(
  db: PostgreSQL,
  opts: SetProjectStateOptions,
): Promise<void> {
  // Validate state type
  if (typeof opts.state !== "string") {
    throw new Error("invalid state type");
  }

  // Validate state value
  if (!COMPUTE_STATES[opts.state]) {
    throw new Error(`state = '${opts.state}' it not a valid state`);
  }

  const state: any = {
    state: opts.state,
    time: opts.time ?? new Date(),
  };

  if (opts.error) {
    state.error = opts.error;
  }

  if (opts.ip) {
    state.ip = opts.ip;
  }

  await db.async_query({
    query: "UPDATE projects",
    set: { "state::JSONB": state },
    where: { "project_id :: UUID = $": opts.project_id },
  });
}

export interface GetProjectStateOptions {
  project_id: string;
}

export async function getProjectState(
  db: PostgreSQL,
  opts: GetProjectStateOptions,
): Promise<any> {
  return await new Promise((resolve, reject) => {
    db._get_project_column("state", opts.project_id, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}
