/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export function sanitizeManageUsersOwnerOnly(
  value: unknown,
): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "object") {
    // Allow nested shape { manage_users_owner_only: boolean } from callers that wrap input.
    const candidate = (value as any).manage_users_owner_only;
    if (candidate !== undefined) {
      return sanitizeManageUsersOwnerOnly(candidate);
    }
    // Allow Immutable.js style get("manage_users_owner_only")
    const getter = (value as any).get;
    if (typeof getter === "function") {
      const maybe = getter.call(value, "manage_users_owner_only");
      if (maybe !== undefined) {
        return sanitizeManageUsersOwnerOnly(maybe);
      }
    }
  }
  if (typeof value !== "boolean") {
    throw Error("manage_users_owner_only must be a boolean");
  }
  return value;
}
