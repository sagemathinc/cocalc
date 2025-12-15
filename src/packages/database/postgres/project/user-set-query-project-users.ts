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

type AllowedUserFields = {
  hide?: boolean;
  upgrades?: Record<string, unknown>;
  ssh_keys?: Record<string, Record<string, unknown> | undefined>;
};

function ensureAllowedKeys(user: Record<string, unknown>): void {
  const allowed = new Set(["hide", "upgrades", "ssh_keys"]);
  for (const key of Object.keys(user)) {
    if (key === "group") {
      throw Error(
        "changing collaborator group via user_set_query is not allowed",
      );
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
  account_id: string,
): Record<string, AllowedUserFields> | undefined {
  if (obj?.users == null) {
    return undefined;
  }
  assert_valid_account_id(account_id);
  if (!is_object(obj.users)) {
    throw Error("users must be an object");
  }

  const sanitized: Record<string, AllowedUserFields> = {};
  const usersInput = obj.users as Record<string, unknown>;

  for (const id of Object.keys(usersInput)) {
    if (!is_valid_uuid_string(id)) {
      throw Error(`invalid account_id '${id}'`);
    }
    if (id !== account_id) {
      throw Error("users set queries may only modify the requesting account");
    }
    const user = usersInput[id];
    if (!is_object(user)) {
      throw Error("user entry must be an object");
    }

    ensureAllowedKeys(user as Record<string, unknown>);

    const entry: AllowedUserFields = {};
    if ("hide" in user) {
      if (typeof (user as any).hide !== "boolean") {
        throw Error("invalid type for field 'hide'");
      }
      entry.hide = (user as any).hide;
    }
    if ("upgrades" in user) {
      entry.upgrades = sanitizeUpgrades((user as any).upgrades);
    }
    if ("ssh_keys" in user) {
      entry.ssh_keys = sanitizeSshKeys((user as any).ssh_keys);
    }
    sanitized[id] = entry;
  }

  return sanitized;
}
