import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type {
  MembershipClass,
  MembershipEntitlements,
  MembershipResolution,
} from "@cocalc/conat/hub/api/purchases";

interface MembershipTierConfig extends MembershipEntitlements {}

interface MembershipConfig {
  tiers?: Record<MembershipClass, MembershipTierConfig>;
  priority?: string[];
}

function normalizeConfig(raw: unknown): MembershipConfig {
  if (raw == null || typeof raw !== "object") {
    return {};
  }
  return raw as MembershipConfig;
}

export async function resolveMembershipForAccount(
  account_id: string,
): Promise<MembershipResolution> {
  const settings = await getServerSettings();
  const config = normalizeConfig((settings as any).membership_tiers);
  const tiers = (config.tiers ?? {}) as Partial<
    Record<MembershipClass, MembershipTierConfig>
  >;

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
      entitlements: tiers[membershipClass] ?? {},
      subscription_id: sub.id,
      expires: sub.current_period_end,
    };
  }

  return {
    class: "free",
    source: "free",
    entitlements: tiers["free"] ?? {},
  };
}
