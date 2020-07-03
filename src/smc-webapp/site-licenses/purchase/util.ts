/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export type User = "academic" | "individual" | "business";
export type Upgrade = "basic" | "standard" | "premium";
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

export const COSTS = {
  user: { academic: 0.5, individual: 0.7, business: 1 },
  upgrade: { basic: 8, standard: 12, premium: 20 },
} as const;

export const ONLINE_DISCOUNT = 0.7;

export const MIN_QUOTE = 100;

const MINIMUM_SALE = 5;

// TODO: this is just a quick sample cost formula so we can see this work.
export function compute_cost(info: PurchaseInfo): number {
  const { quantity, user, upgrade, subscription, start, end } = info;
  let cost = quantity * COSTS.user[user] * COSTS.upgrade[upgrade];
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
  return Math.max(MINIMUM_SALE, Math.round(cost));
}

export function compute_discounted_cost(cost: number): number {
  return Math.max(MINIMUM_SALE, Math.round(cost * ONLINE_DISCOUNT));
}

export function percent_discount(
  cost: number,
  discounted_cost: number
): number {
  return Math.round(100 * (1 - discounted_cost / cost));
}
