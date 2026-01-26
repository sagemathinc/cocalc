/*
 *  This file is part of CoCalc: Copyright © 2020 - 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Helper functions for checking project ownership and collaborator management permissions.
*/

import { db as getDb } from "@cocalc/database";
import { query } from "@cocalc/database/postgres/query";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { is_valid_uuid_string } from "@cocalc/util/misc";
import {
  type UserGroup,
  OwnershipErrorCode,
} from "@cocalc/util/project-ownership";

export class OwnershipError extends Error {
  code: OwnershipErrorCode;
  constructor(message: string, code: OwnershipErrorCode) {
    super(message);
    this.name = "OwnershipError";
    this.code = code;
  }
}

function validateUUIDs(project_id: string, account_id: string): void {
  if (!is_valid_uuid_string(project_id)) {
    throw Error(`Invalid project_id: ${project_id}`);
  }
  if (!is_valid_uuid_string(account_id)) {
    throw Error(`Invalid account_id: ${account_id}`);
  }
}

/**
 * Ensures that a user can be removed from a project.
 * Prevents removing owners - they must be demoted to collaborator first.
 *
 * @throws {OwnershipError} If the target user is an owner
 */
export async function ensureCanRemoveUser(opts: {
  project_id: string;
  target_account_id: string;
}): Promise<void> {
  const { project_id, target_account_id } = opts;

  // Validate UUIDs to prevent SQL injection
  validateUUIDs(project_id, target_account_id);

  const db = getDb();
  const result = await db.async_query({
    query: `SELECT users#>'{${target_account_id},group}' AS group FROM projects WHERE project_id=$1`,
    params: [project_id],
  });

  if (result.rows.length === 0) {
    throw Error(`Project not found: ${project_id}`);
  }

  const target_user_group = result.rows[0]?.group;
  if (target_user_group === "owner") {
    throw new OwnershipError(
      "Cannot remove an owner. Demote to collaborator first.",
      OwnershipErrorCode.CANNOT_REMOVE_OWNER,
    );
  }
}

export async function ensureCanManageCollaborators(opts: {
  project_id: string;
  account_id: string;
}): Promise<void> {
  const { project_id, account_id } = opts;

  // Validate UUIDs to prevent SQL injection
  validateUUIDs(project_id, account_id);

  const serverSettings = await getServerSettings();
  const siteEnforced = !!serverSettings.strict_collaborator_management;

  const db = getDb();
  const project = await query({
    db,
    table: "projects",
    select: ["users", "manage_users_owner_only"],
    where: { project_id },
    one: true,
  });

  if (!project) {
    throw new OwnershipError(
      "Project not found",
      OwnershipErrorCode.INVALID_PROJECT_STATE,
    );
  }

  const manage_users_owner_only = project.manage_users_owner_only ?? false;
  const requesting_user_group = project.users?.[account_id]?.group as
    | UserGroup
    | undefined;

  const restrictToOwners = siteEnforced || manage_users_owner_only;

  if (restrictToOwners && requesting_user_group !== "owner") {
    throw new OwnershipError(
      "Only owners can manage collaborators when this setting is enabled",
      OwnershipErrorCode.NOT_OWNER,
    );
  }
}
