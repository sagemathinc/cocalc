import getPool, { PoolClient } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type { MembershipClass } from "@cocalc/conat/hub/api/purchases";
import { round2up } from "@cocalc/util/misc";

export interface MembershipTierPricing {
  price_monthly?: number;
  price_yearly?: number;
  features?: Record<string, unknown>;
  project_defaults?: Record<string, unknown>;
  llm_limits?: Record<string, unknown>;
}

export interface MembershipTiersConfig {
  tiers?: Record<MembershipClass, MembershipTierPricing>;
  priority?: string[];
}

export interface MembershipPricingResult {
  price: number;
  charge: number;
  refund: number;
  existing_subscription_id?: number;
  existing_class?: MembershipClass;
  current_period_start?: Date;
  current_period_end?: Date;
}

export async function getMembershipTiersConfig(): Promise<MembershipTiersConfig> {
  const settings = await getServerSettings();
  const raw = (settings as any).membership_tiers;
  if (raw == null || typeof raw !== "object") {
    return {};
  }
  return raw as MembershipTiersConfig;
}

export function getMembershipPrice(
  tiers: MembershipTiersConfig,
  membershipClass: MembershipClass,
  interval: "month" | "year",
): number {
  const tier = tiers.tiers?.[membershipClass];
  if (!tier) {
    throw Error(`no membership tier "${membershipClass}" configured`);
  }
  const price =
    interval == "month" ? tier.price_monthly : tier.price_yearly;
  if (price == null || !Number.isFinite(price) || price < 0) {
    throw Error(
      `invalid membership price for "${membershipClass}" (${interval})`,
    );
  }
  return price;
}

export async function getActiveMembershipSubscription({
  account_id,
  client,
}: {
  account_id: string;
  client?: PoolClient;
}): Promise<
  | {
      id: number;
      metadata: { class?: MembershipClass };
      cost: number;
      current_period_start: Date;
      current_period_end: Date;
      status: string;
    }
  | undefined
> {
  const pool = client ?? getPool("medium");
  const { rows } = await pool.query(
    `SELECT id, metadata, cost, current_period_start, current_period_end, status
     FROM subscriptions
     WHERE account_id=$1
       AND metadata->>'type'='membership'
       AND status IN ('active','unpaid','past_due')
       AND current_period_end >= NOW()
     ORDER BY current_period_end DESC
     LIMIT 1`,
    [account_id],
  );
  return rows[0];
}

export async function computeMembershipPricing({
  account_id,
  targetClass,
  interval,
  client,
}: {
  account_id: string;
  targetClass: MembershipClass;
  interval: "month" | "year";
  client?: PoolClient;
}): Promise<MembershipPricingResult> {
  const tiers = await getMembershipTiersConfig();
  const price = getMembershipPrice(tiers, targetClass, interval);
  const existing = await getActiveMembershipSubscription({
    account_id,
    client,
  });

  if (existing?.metadata?.class) {
    const existingClass = existing.metadata.class;
    if (existingClass == targetClass) {
      throw Error(`already subscribed to ${targetClass}`);
    }
    if (existingClass == "pro") {
      throw Error("already subscribed to pro");
    }
    if (existingClass != "member" || targetClass != "pro") {
      throw Error("unsupported membership change");
    }
  }

  let refund = 0;
  if (existing?.metadata?.class == "member" && targetClass == "pro") {
    const start = new Date(existing.current_period_start).valueOf();
    const end = new Date(existing.current_period_end).valueOf();
    const now = Date.now();
    if (end > now && end > start) {
      const fraction = Math.max(0, Math.min(1, (end - now) / (end - start)));
      refund = round2up(existing.cost * fraction);
    }
  }

  const charge = Math.max(0, round2up(price - refund));
  return {
    price,
    charge,
    refund,
    existing_subscription_id: existing?.id,
    existing_class: existing?.metadata?.class,
    current_period_start: existing?.current_period_start,
    current_period_end: existing?.current_period_end,
  };
}
