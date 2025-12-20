import type { Host } from "@cocalc/conat/hub/api/hosts";

export type UserTier = "free" | "member" | "pro";

export function computePlacementPermission({
  tier,
  userTier,
  isOwner,
  isCollab,
}: {
  tier?: Host["tier"];
  userTier: UserTier;
  isOwner: boolean;
  isCollab: boolean;
}): { can_place: boolean; reason_unavailable?: string } {
  // owners/collabs always allowed
  let can_place = isOwner || isCollab;
  let reason_unavailable: string | undefined;

  if (tier && !can_place) {
    if (tier === "free") {
      can_place = true;
    } else if (tier === "member" && (userTier === "member" || userTier === "pro")) {
      can_place = true;
    } else if (tier === "pro" && userTier === "pro") {
      can_place = true;
    } else {
      reason_unavailable =
        tier === "member"
          ? "Requires member tier"
          : tier === "pro"
            ? "Requires pro tier"
            : "Not available";
    }
  }

  return { can_place, reason_unavailable };
}
