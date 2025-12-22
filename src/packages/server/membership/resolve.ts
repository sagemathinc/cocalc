import getPool from "@cocalc/database/pool";
import type {
  MembershipClass,
  MembershipEntitlements,
  MembershipResolution,
} from "@cocalc/conat/hub/api/purchases";
import { getMembershipTierMap, MembershipTierRecord } from "./tiers";

function tierToEntitlements(
  tier?: MembershipTierRecord,
): MembershipEntitlements {
  if (!tier) return {};
  return {
    project_defaults: tier.project_defaults,
    llm_limits: tier.llm_limits,
    features: tier.features,
  };
}

export async function resolveMembershipForAccount(
  account_id: string,
): Promise<MembershipResolution> {
  const tiers = await getMembershipTierMap({ includeDisabled: true });

  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT id, metadata, current_period_end, status
     FROM subscriptions
     WHERE account_id=$1
       AND metadata->>'type'='membership'
       AND status IN ('active','unpaid','past_due')
       AND current_period_end >= NOW()
     ORDER BY current_period_end DESC
     LIMIT 1`,
    [account_id],
  );

  const sub = rows[0];
  if (sub) {
    const membershipClass = (sub.metadata?.class ??
      "free") as MembershipClass;
    return {
      class: membershipClass,
      source: "subscription",
      entitlements: tierToEntitlements(tiers[membershipClass]),
      subscription_id: sub.id,
      expires: sub.current_period_end,
    };
  }

  return {
    class: "free",
    source: "free",
    entitlements: tierToEntitlements(tiers["free"]),
  };
}
