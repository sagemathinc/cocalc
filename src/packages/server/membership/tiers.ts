import getPool, { PoolClient } from "@cocalc/database/pool";
import type { MembershipClass } from "@cocalc/conat/hub/api/purchases";
import { round2up } from "@cocalc/util/misc";

export interface MembershipTierPricing {
  price_monthly?: number;
  price_yearly?: number;
  features?: Record<string, unknown>;
  project_defaults?: Record<string, unknown>;
  llm_limits?: Record<string, unknown>;
}

export interface MembershipTierRecord extends MembershipTierPricing {
  id: MembershipClass;
  label?: string;
  store_visible?: boolean;
  priority?: number;
  disabled?: boolean;
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

export async function getMembershipTiers({
  includeDisabled = true,
  storeVisibleOnly = false,
  client,
}: {
  includeDisabled?: boolean;
  storeVisibleOnly?: boolean;
  client?: PoolClient;
} = {}): Promise<MembershipTierRecord[]> {
  const pool = client ?? getPool("medium");
  const { rows } = await pool.query(
    `SELECT id, label, store_visible, priority, price_monthly, price_yearly,
            project_defaults, llm_limits, features, disabled
     FROM membership_tiers`,
  );
  let tiers = rows as MembershipTierRecord[];
  if (!includeDisabled) {
    tiers = tiers.filter((tier) => !tier.disabled);
  }
  if (storeVisibleOnly) {
    tiers = tiers.filter((tier) => tier.store_visible);
  }
  return tiers;
}

export async function getMembershipTierMap({
  includeDisabled = true,
  client,
}: {
  includeDisabled?: boolean;
  client?: PoolClient;
} = {}): Promise<Record<string, MembershipTierRecord>> {
  const tiers = await getMembershipTiers({ includeDisabled, client });
  return tiers.reduce(
    (acc, tier) => {
      acc[tier.id] = tier;
      return acc;
    },
    {} as Record<string, MembershipTierRecord>,
  );
}

export function getMembershipPrice(
  tier: MembershipTierRecord | undefined,
  interval: "month" | "year",
): number {
  if (!tier) {
    throw Error("membership tier not configured");
  }
  const price =
    interval == "month" ? tier.price_monthly : tier.price_yearly;
  if (price == null || !Number.isFinite(price) || price < 0) {
    throw Error(`invalid membership price for "${tier.id}" (${interval})`);
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
  const tierMap = await getMembershipTierMap({
    includeDisabled: true,
    client,
  });
  let targetTier: MembershipTierRecord | undefined = tierMap[targetClass];
  if (!targetTier) {
    const pool = client ?? getPool();
    const { rows } = await pool.query(
      `SELECT id, label, store_visible, priority, price_monthly, price_yearly,
              project_defaults, llm_limits, features, disabled
       FROM membership_tiers
       WHERE id=$1`,
      [targetClass],
    );
    targetTier = rows[0] as MembershipTierRecord | undefined;
  }
  if (!targetTier || targetTier.disabled) {
    throw Error(`membership tier "${targetClass}" is not available`);
  }
  const price = getMembershipPrice(targetTier, interval);
  const existing = await getActiveMembershipSubscription({
    account_id,
    client,
  });

  const existingClass = existing?.metadata?.class;
  const existingTier = existingClass ? tierMap[existingClass] : undefined;
  const existingPriority = existingTier?.priority ?? 0;
  const targetPriority = targetTier?.priority ?? 0;
  if (existingClass) {
    if (existingClass == targetClass) {
      throw Error(`already subscribed to ${targetClass}`);
    }
    if (targetPriority <= existingPriority) {
      throw Error("unsupported membership change");
    }
  }

  let refund = 0;
  if (existingClass && targetPriority > existingPriority) {
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
