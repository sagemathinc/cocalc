import type { MembershipEntitlements } from "@cocalc/conat/hub/api/purchases";
import type { Host } from "@cocalc/conat/hub/api/hosts";

export type UserHostTier = number;

export function normalizeHostTier(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function getUserHostTier(
  entitlements?: MembershipEntitlements,
): UserHostTier {
  return normalizeHostTier(entitlements?.features?.project_host_tier);
}

export function computePlacementPermission({
  tier,
  userTier,
  isOwner,
  isCollab,
}: {
  tier?: Host["tier"];
  userTier: UserHostTier;
  isOwner: boolean;
  isCollab: boolean;
}): { can_place: boolean; reason_unavailable?: string } {
  // owners/collabs always allowed
  let can_place = isOwner || isCollab;
  let reason_unavailable: string | undefined;

  if (tier != null && !can_place) {
    const hostTier = normalizeHostTier(tier);
    if (userTier >= hostTier) {
      can_place = true;
    } else {
      reason_unavailable = `Requires project host tier ≥ ${hostTier}`;
    }
  }

  return { can_place, reason_unavailable };
}
