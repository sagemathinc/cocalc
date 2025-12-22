import type { MembershipEntitlements } from "@cocalc/conat/hub/api/purchases";
import { resolveMembershipForAccount } from "./resolve";

export type ProjectSettings = Record<string, unknown>;

const SETTINGS_FIELDS = [
  "cores",
  "cpu_shares",
  "mintime",
  "memory",
  "memory_request",
  "disk_quota",
  "member_host",
  "privileged",
  "network",
  "always_running",
] as const;

type SettingsField = (typeof SETTINGS_FIELDS)[number];
export type MembershipProjectDefaults = Partial<Record<SettingsField, number>>;

function coerceNumber(value: unknown): number | undefined {
  if (typeof value == "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value == "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof value == "boolean") {
    return value ? 1 : 0;
  }
  return undefined;
}

export function normalizeMembershipProjectDefaults(
  raw: MembershipEntitlements["project_defaults"] | undefined,
): MembershipProjectDefaults {
  if (raw == null || typeof raw !== "object") {
    return {};
  }
  const defaults: MembershipProjectDefaults = {};
  for (const key of SETTINGS_FIELDS) {
    const value = coerceNumber((raw as Record<string, unknown>)[key]);
    if (value == null || value < 0) continue;
    defaults[key] = value;
  }
  return defaults;
}

export function mergeProjectSettingsWithMembership(
  settings: ProjectSettings | null | undefined,
  membershipDefaults: MembershipProjectDefaults,
): ProjectSettings {
  const merged: ProjectSettings = { ...(settings ?? {}) };
  for (const [key, value] of Object.entries(membershipDefaults)) {
    const baseValue = coerceNumber(merged[key]);
    if (baseValue == null || value > baseValue) {
      merged[key] = value;
    }
  }
  return merged;
}

export async function getMembershipProjectDefaultsFromUsers(users: unknown) {
  const owner = getProjectOwnerFromUsers(users);
  if (!owner) return {};
  const resolution = await resolveMembershipForAccount(owner);
  return normalizeMembershipProjectDefaults(
    resolution.entitlements?.project_defaults,
  );
}

function getProjectOwnerFromUsers(users: unknown): string | undefined {
  if (users == null || typeof users !== "object") return;
  for (const [account_id, user] of Object.entries(
    users as Record<string, { group?: string }>,
  )) {
    if (user?.group == "owner") {
      return account_id;
    }
  }
  return;
}
