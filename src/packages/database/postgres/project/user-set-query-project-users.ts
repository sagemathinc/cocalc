/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import {
  assert_valid_account_id,
  is_object,
  is_valid_uuid_string,
} from "@cocalc/util/misc";
import { type UserGroup } from "@cocalc/util/project-ownership";

type AllowedUserFields = {
  group?: UserGroup;
  hide?: boolean;
  upgrades?: Record<string, unknown>;
  ssh_keys?: Record<string, Record<string, unknown> | undefined>;
};

function ensureAllowedKeys(
  user: Record<string, unknown>,
  allowGroupChanges: boolean,
): void {
  const allowed = new Set(["hide", "upgrades", "ssh_keys"]);
  for (const key of Object.keys(user)) {
    if (key === "group") {
      if (!allowGroupChanges) {
        throw Error(
          "changing collaborator group via user_set_query is not allowed",
        );
      }
      continue;
    }
    if (!allowed.has(key)) {
      throw Error(`unknown field '${key}'`);
    }
  }
}

function sanitizeUpgrades(upgrades: unknown): Record<string, unknown> {
  if (!is_object(upgrades)) {
    throw Error("invalid type for field 'upgrades'");
  }
  const allowedUpgrades = PROJECT_UPGRADES.params;
  for (const key of Object.keys(upgrades)) {
    if (!Object.prototype.hasOwnProperty.call(allowedUpgrades, key)) {
      throw Error(`invalid upgrades field '${key}'`);
    }
  }
  return upgrades as Record<string, unknown>;
}

function sanitizeSshKeys(
  ssh_keys: unknown,
): Record<string, Record<string, unknown> | undefined> {
  if (!is_object(ssh_keys)) {
    throw Error("ssh_keys must be an object");
  }
  const sanitized: Record<string, Record<string, unknown> | undefined> = {};
  for (const fingerprint of Object.keys(ssh_keys)) {
    const key = (ssh_keys as Record<string, unknown>)[fingerprint];
    if (!key) {
      sanitized[fingerprint] = undefined;
      continue;
    }
    if (!is_object(key)) {
      throw Error("each key in ssh_keys must be an object");
    }
    for (const field of Object.keys(key)) {
      if (
        !["title", "value", "creation_date", "last_use_date"].includes(field)
      ) {
        throw Error(`invalid ssh_keys field '${field}'`);
      }
    }
    sanitized[fingerprint] = key as Record<string, unknown>;
  }
  return sanitized;
}

/**
 * Sanitize and security-check project user mutations submitted via user set query.
 *
 * Only permits modifying the requesting user's own entry (hide/upgrades/ssh_keys).
 * Collaborator role changes must use dedicated APIs that enforce ownership rules.
 */
export function sanitizeUserSetQueryProjectUsers(
  obj: { users?: unknown } | undefined,
  account_id?: string,
): Record<string, AllowedUserFields> | undefined {
  if (obj?.users == null) {
    return undefined;
  }
  if (account_id != null) {
    assert_valid_account_id(account_id);
  }
  if (!is_object(obj.users)) {
    throw Error("users must be an object");
  }

  const sanitized: Record<string, AllowedUserFields> = {};
  const usersInput = obj.users as Record<string, unknown>;

  for (const id of Object.keys(usersInput)) {
    if (!is_valid_uuid_string(id)) {
      throw Error(`invalid account_id '${id}'`);
    }
    const user = usersInput[id];
    if (!is_object(user)) {
      throw Error("user entry must be an object");
    }

    const isSelf = account_id == null || id === account_id;
    ensureAllowedKeys(user as Record<string, unknown>, account_id == null);

    const entry: AllowedUserFields = {};
    if ("group" in user) {
      if (account_id != null) {
        throw Error(
          "changing collaborator group via user_set_query is not allowed",
        );
      }
      const group = (user as any).group;
      if (group !== "owner" && group !== "collaborator") {
        throw Error(
          `invalid group value '${group}' - must be 'owner' or 'collaborator'`,
        );
      }
      entry.group = group;
    }
    if ("hide" in user) {
      if (typeof (user as any).hide !== "boolean") {
        throw Error("invalid type for field 'hide'");
      }
      entry.hide = (user as any).hide;
    }
    if ("upgrades" in user) {
      if (!isSelf) {
        throw Error(
          "users set queries may only change upgrades for the requesting account",
        );
      }
      entry.upgrades = sanitizeUpgrades((user as any).upgrades);
    }
    if ("ssh_keys" in user) {
      if (!isSelf) {
        throw Error(
          "users set queries may only change ssh_keys for the requesting account",
        );
      }
      entry.ssh_keys = sanitizeSshKeys((user as any).ssh_keys);
    }
    sanitized[id] = entry;
  }

  return sanitized;
}
