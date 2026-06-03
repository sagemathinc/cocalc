/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { validateOpts } from "./utils";
import type { PostgreSQL } from "../types";

export interface AddUserToProjectOptions {
  project_id: string;
  account_id: string;
  group?: string; // defaults to 'collaborator'
}

export async function addUserToProject(
  db: PostgreSQL,
  opts: AddUserToProjectOptions,
): Promise<void> {
  // Validate inputs
  validateOpts(opts);

  const group = opts.group ?? "collaborator";

  await db.async_query({
    query: "UPDATE projects",
    jsonb_merge: {
      users: {
        [opts.account_id]: {
          group,
        },
      },
    },
    where: {
      "project_id = $::UUID": opts.project_id,
    },
  });
}

export interface RemoveCollaboratorFromProjectOptions {
  project_id: string;
  account_id: string;
}

export async function removeCollaboratorFromProject(
  db: PostgreSQL,
  opts: RemoveCollaboratorFromProjectOptions,
): Promise<void> {
  // Validate inputs
  validateOpts(opts);

  // Remove user but only if they are not an owner
  // The WHERE clause prevents removing owners
  await db.async_query({
    query: "UPDATE projects",
    jsonb_set: { users: { [opts.account_id]: null } },
    where: {
      "project_id :: UUID = $": opts.project_id,
      [`users#>>'{${opts.account_id},group}' != $::TEXT`]: "owner",
    },
  });
}

export interface RemoveUserFromProjectOptions {
  project_id: string;
  account_id: string;
}

export async function removeUserFromProject(
  db: PostgreSQL,
  opts: RemoveUserFromProjectOptions,
): Promise<void> {
  // Validate inputs
  validateOpts(opts);

  // Remove any user, even an owner (no restrictions)
  await db.async_query({
    query: "UPDATE projects",
    jsonb_set: { users: { [opts.account_id]: null } },
    where: { "project_id :: UUID = $": opts.project_id },
  });
}
