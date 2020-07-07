/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export type User = "academic" | "business";
export type Upgrade = "small" | "medium" | "large" | "pro";
export type Subscription = "no" | "monthly" | "yearly";

export interface PurchaseInfo {
  user: User;
  upgrade: Upgrade;
  quantity: number;
  subscription: Subscription;
  start: Date;
  end?: Date;
  quote?: boolean;
  quote_info?: string;
  payment_method?: string;
  cost?: number; // use cost and discounted_cost as double check on backend only (i.e., don't trust them, but on other hand be careful not to charge more!)
  discounted_cost?: number;
}

// discount is the number we multiply the price by:

// TODO: move the actual **data** that defines this cost map to the database
// and admin site settings.  It must be something that we can change at any time,
// and that somebody else selling cocalc would set differently.

const ACADEMIC_DISCOUNT = 0.6;
export const COSTS: {
  user_discount: { [user in User]: number };
  sub_discount: { [sub in Subscription]: number };
  online_discount: number;
  min_quote: number;
  min_sale: number;
  base_cost: { [upgrade in Upgrade]: number };
} = {
  user_discount: { academic: ACADEMIC_DISCOUNT, business: 1 },
  sub_discount: { no: 1, monthly: 1, yearly: 0.85 },
  online_discount: 0.75,
  min_quote: 100,
  min_sale: 7,
  base_cost: {
    small: 8 / ACADEMIC_DISCOUNT,
    medium: 16 / ACADEMIC_DISCOUNT,
    large: 24 / ACADEMIC_DISCOUNT,
    pro: 36 / ACADEMIC_DISCOUNT,
  },
} as const;

// TODO: this is just a quick sample cost formula so we can see this work.
export function compute_cost(info: PurchaseInfo): number {
  const { quantity, user, upgrade, subscription, start, end } = info;
  let cost =
    quantity *
    COSTS.user_discount[user] *
    COSTS.base_cost[upgrade] *
    COSTS.sub_discount[subscription];
  if (subscription == "no") {
    if (end == null) {
      throw Error("end must be set if subscription is no");
    }
    // scale by factor of a month
    const months =
      (end.valueOf() - start.valueOf()) / (30.5 * 24 * 60 * 60 * 1000);
    cost *= months;
  } else if (subscription == "yearly") {
    cost *= 12;
  }
  return Math.max(COSTS.min_sale, cost);
}

export function compute_discounted_cost(cost: number): number {
  return Math.max(COSTS.min_sale, cost * COSTS.online_discount);
}

export function percent_discount(
  cost: number,
  discounted_cost: number
): number {
  return Math.round(100 * (1 - discounted_cost / cost));
}

export function money(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
}
