/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project ownership transfer validation logic.

This module provides shared validation functions used by both frontend (for UI)
and backend (for enforcement) to ensure consistent ownership transfer rules.
*/

export type UserGroup = "owner" | "collaborator";

/**
 * Error codes for ownership validation failures.
 *
 * These codes are machine-friendly identifiers that can be mapped to
 * user-friendly error messages in the frontend (see packages/frontend/i18n/common.ts).
 *
 * All error codes are tested in project-ownership.test.ts with comprehensive
 * scenario coverage (see test file header for full scenario matrix).
 */
export enum OwnershipErrorCode {
  LAST_OWNER = "LAST_OWNER", // Cannot demote the last owner
  NOT_OWNER = "NOT_OWNER", // Only owners can perform this action
  INVALID_TARGET = "INVALID_TARGET", // Target user is invalid or not in project
  INVALID_USER = "INVALID_USER", // User not found in project
  CANNOT_REMOVE_OWNER = "CANNOT_REMOVE_OWNER", // Cannot remove owners directly
  INVALID_REQUESTING_USER = "INVALID_REQUESTING_USER", // Requesting user is not a valid member
  INVALID_PROJECT_STATE = "INVALID_PROJECT_STATE", // Project data is missing or invalid
}

export interface ValidationResult {
  valid: boolean;
  errorCode?: OwnershipErrorCode;
  error?: string;
}

/**
 * Type guard to check if a value is a valid UserGroup.
 *
 * @param value - Value to check
 * @returns true if value is "owner" or "collaborator"
 */
export function isUserGroup(value: any): value is UserGroup {
  return value === "owner" || value === "collaborator";
}

/**
 * Count the number of owners in a project.
 *
 * @param users - Map of account_id to user data with group field
 * @returns Number of owners (users with group === "owner")
 */
export function countOwners(
  users: { [account_id: string]: { group?: string } } | null | undefined,
): number {
  if (!users) {
    return 0;
  }
  let count = 0;
  for (const account_id in users) {
    if (users[account_id]?.group === "owner") {
      count++;
    }
  }
  return count;
}

/**
 * Check if a specific user is the last owner in a project.
 *
 * @param account_id - The account ID to check
 * @param users - Map of all project users
 * @returns true if the user is an owner AND is the only owner
 */
export function isLastOwner(
  account_id: string,
  users: { [account_id: string]: { group?: string } } | null | undefined,
): boolean {
  if (!users) {
    return false;
  }
  const userGroup = users[account_id]?.group;
  if (userGroup !== "owner") {
    return false;
  }
  return countOwners(users) === 1;
}

/**
 * Validate whether a user type change (promotion/demotion) is allowed.
 *
 * Validation rules:
 * 1. all_users must be provided
 * 2. Requesting user must be a valid owner or collaborator
 * 3. Only owners can change user types
 * 4. Target must be a current project member
 * 5. Target must currently be owner or collaborator
 * 6. Target new group must be valid (owner or collaborator)
 * 7. Cannot demote the last owner (must maintain ≥1 owner)
 *
 * @param opts.requesting_account_id - Account ID of user making the request
 * @param opts.requesting_user_group - Group of the user requesting the change (owner or collaborator)
 * @param opts.target_account_id - Account ID of user being changed
 * @param opts.target_current_group - Current group of target user
 * @param opts.target_new_group - New group to assign to target
 * @param opts.all_users - All users in the project
 * @returns Validation result with valid flag and optional error details
 */
export function validateUserTypeChange(opts: {
  requesting_account_id: string;
  requesting_user_group: UserGroup | undefined;
  target_account_id: string;
  target_current_group: UserGroup | undefined;
  target_new_group: UserGroup;
  all_users:
    | { [account_id: string]: { group?: UserGroup | string } }
    | null
    | undefined;
}): ValidationResult {
  const {
    requesting_user_group,
    target_account_id,
    target_current_group,
    target_new_group,
    all_users,
  } = opts;

  // Rule 1: all_users must be provided (missing = invalid project state)
  if (!all_users) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_PROJECT_STATE,
      error: "Project users data is required",
    };
  }

  // Rule 2: Requesting user must be a valid member (owner or collaborator)
  if (!isUserGroup(requesting_user_group)) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_REQUESTING_USER,
      error: "Requesting user is not a valid project member",
    };
  }

  // Rule 3: Only owners can change user types
  if (requesting_user_group !== "owner") {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.NOT_OWNER,
      error: "Only project owners can change user types",
    };
  }

  // Rule 4: Target must exist in project
  if (!all_users[target_account_id]) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_USER,
      error: "Target user is not a member of this project",
    };
  }

  // Rule 5: Target must currently be owner or collaborator
  if (!isUserGroup(target_current_group)) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_TARGET,
      error:
        "Target user does not have a valid group (must be owner or collaborator)",
    };
  }

  // Rule 6: New group must be valid
  if (!isUserGroup(target_new_group)) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_TARGET,
      error: "New group must be either 'owner' or 'collaborator'",
    };
  }

  // Rule 7: If demoting an owner, ensure at least one owner remains
  if (target_current_group === "owner" && target_new_group === "collaborator") {
    const ownerCount = countOwners(all_users);
    if (ownerCount <= 1) {
      return {
        valid: false,
        errorCode: OwnershipErrorCode.LAST_OWNER,
        error:
          "Cannot change the last owner to collaborator. At least one owner is required.",
      };
    }
  }

  // All validation passed
  return { valid: true };
}

/**
 * Check if a user can manage collaborators based on their role and project settings.
 *
 * @param opts.user_group - The user's group (owner or collaborator)
 * @param opts.manage_users_owner_only - Project setting for restricting management (database field name)
 * @returns true if user can manage collaborators
 */
export function canManageCollaborators(opts: {
  user_group: UserGroup | undefined;
  manage_users_owner_only: boolean;
}): boolean {
  const { user_group, manage_users_owner_only } = opts;

  // User must be a valid member
  if (!isUserGroup(user_group)) {
    return false;
  }

  // If setting is disabled, both owners and collaborators can manage
  if (!manage_users_owner_only) {
    return true;
  }

  // If setting is enabled, only owners can manage
  return user_group === "owner";
}

/**
 * Validate whether removing a collaborator is allowed.
 *
 * IMPORTANT: Callers MUST provide target_user_group derived from actual project data
 * (not from user input). Pass undefined if the target is not in the project.
 * This ensures INVALID_TARGET is returned for users not in the project.
 *
 * Validation rules:
 * 1. Requesting user must be a valid member
 * 2. Target user must exist in project (undefined target_user_group = not in project)
 * 3. Target user must have a valid group
 * 4. Cannot remove owners directly (must demote to collaborator first)
 * 5. Users can always remove themselves (except owners - they must demote first)
 * 6. When onlyOwnersManageCollaborators is enabled, only owners can remove others
 *
 * @param opts.requesting_account_id - Account ID of user making the request
 * @param opts.requesting_user_group - Group of user making the request
 * @param opts.target_account_id - Account ID of user being removed
 * @param opts.target_user_group - Group of user being removed (undefined if not in project)
 * @param opts.manage_users_owner_only - Project setting (database field name)
 * @returns Validation result
 */
export function validateRemoveCollaborator(opts: {
  requesting_account_id: string;
  requesting_user_group: UserGroup | undefined;
  target_account_id: string;
  target_user_group: UserGroup | undefined;
  manage_users_owner_only: boolean;
}): ValidationResult {
  const {
    requesting_account_id,
    requesting_user_group,
    target_account_id,
    target_user_group,
    manage_users_owner_only,
  } = opts;

  // Rule 1: Requesting user must be a valid member
  if (!isUserGroup(requesting_user_group)) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_REQUESTING_USER,
      error: "Requesting user is not a valid project member",
    };
  }

  // Rule 2 & 3: Target user must exist and have a valid group
  // undefined target_user_group means the target is not in the project
  if (!target_user_group) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_TARGET,
      error: "Target user is not a member of this project",
    };
  }

  if (!isUserGroup(target_user_group)) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_TARGET,
      error: "Target user does not have a valid group",
    };
  }

  // Rule 4: Cannot remove owners directly (enforces two-step process)
  if (target_user_group === "owner") {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.CANNOT_REMOVE_OWNER,
      error: "Cannot remove an owner. Demote to collaborator first.",
    };
  }

  // Rule 5: Self-removal is always allowed for collaborators
  const is_self_remove = requesting_account_id === target_account_id;
  if (is_self_remove) {
    return { valid: true };
  }

  // Rule 6: Check manage_users_owner_only setting
  if (manage_users_owner_only && requesting_user_group !== "owner") {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.NOT_OWNER,
      error:
        "Only owners can remove collaborators when this setting is enabled",
    };
  }

  return { valid: true };
}

/**
 * Validate whether adding a collaborator is allowed.
 *
 * @param opts.user_group - Group of user making the request
 * @param opts.manage_users_owner_only - Project setting (database field name)
 * @returns Validation result
 */
export function validateAddCollaborator(opts: {
  user_group: UserGroup | undefined;
  manage_users_owner_only: boolean;
}): ValidationResult {
  const { user_group, manage_users_owner_only } = opts;

  // Requesting user must be a valid member
  if (!isUserGroup(user_group)) {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.INVALID_REQUESTING_USER,
      error: "Requesting user is not a valid project member",
    };
  }

  // When setting is enabled, only owners can add
  if (manage_users_owner_only && user_group !== "owner") {
    return {
      valid: false,
      errorCode: OwnershipErrorCode.NOT_OWNER,
      error: "Only owners can add collaborators when this setting is enabled",
    };
  }

  return { valid: true };
}
