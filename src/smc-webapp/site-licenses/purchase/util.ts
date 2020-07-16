/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export type User = "academic" | "business";
export type Upgrade = "basic" | "standard" | "custom";
export type Subscription = "no" | "monthly" | "yearly";
export type CustomUpgrades = "ram" | "cpu" | "disk" | "always_on";

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
  cost?: { cost: number; discounted_cost: number; cost_per_project: number }; // use cost and discounted_cost as double check on backend only (i.e., don't trust them, but on other hand be careful not to charge more!)
  custom_ram: number;
  custom_cpu: number;
  custom_disk: number;
  custom_always_on: boolean;
}

// discount is the number we multiply the price by:

// TODO: move the actual **data** that defines this cost map to the database
// and admin site settings.  It must be something that we can change at any time,
// and that somebody else selling cocalc would set differently.

// See https://cloud.google.com/compute/vm-instance-pricing#e2_custommachinetypepricing
// for the monthly GCE prices
const GCE_COSTS = {
  ram: 0.67, // for pre-emptibles
  cpu: 5, // for pre-emptibles
  disk: 0.04, // per GB/month
  non_pre_factor: 3.33, // factor for non-preemptible
};

const ACADEMIC_DISCOUNT = 0.6; // changing this doesn't change the actual academic prices -- it just changes the *business* prices.
const COST_MULTIPLIER = 0.75; // we charge LESS than Google VM's, due to multiple users on a node at once.
const CUSTOM_COST = {
  ram: (COST_MULTIPLIER * GCE_COSTS.ram) / ACADEMIC_DISCOUNT,
  cpu: (COST_MULTIPLIER * GCE_COSTS.cpu) / ACADEMIC_DISCOUNT,
  disk: (10 * (COST_MULTIPLIER * GCE_COSTS.disk)) / ACADEMIC_DISCOUNT, // 10 since we have about that many copies of user data, plus snapshots, and we store their data long after they stop paying!
  always_on: 2 * GCE_COSTS.non_pre_factor,  // factor of 2 since this is a gamble by us and we don't know they will use it for a full month; lots of uncertainty
} as const;
const BASIC = { ram: 1, cpu: 1, disk: 1, always_on: 0 } as const;
const STANDARD = { ram: 2, cpu: 2, disk: 3, always_on: 0 } as const;
export const COSTS: {
  user_discount: { [user in User]: number };
  sub_discount: { [sub in Subscription]: number };
  online_discount: number;
  min_quote: number;
  min_sale: number;
  basic_cost: number;
  standard_cost: number;
  custom_cost: { [key in CustomUpgrades]: number };
  custom_max: { [key in CustomUpgrades]: number };
  basic: { [key in CustomUpgrades]: number };
  standard: { [key in CustomUpgrades]: number };
} = {
  user_discount: { academic: ACADEMIC_DISCOUNT, business: 1 },
  sub_discount: { no: 1, monthly: 0.9, yearly: 0.85 },
  online_discount: 0.75,
  min_quote: 100,
  min_sale: 1,
  basic_cost:
    BASIC.ram * CUSTOM_COST.ram +
    BASIC.cpu * CUSTOM_COST.cpu +
    BASIC.disk * CUSTOM_COST.disk,
  standard_cost:
    STANDARD.ram * CUSTOM_COST.ram +
    STANDARD.cpu * CUSTOM_COST.cpu +
    STANDARD.disk * CUSTOM_COST.disk,
  custom_cost: CUSTOM_COST,
  custom_max: { ram: 16, cpu: 4, disk: 20, always_on: 1 },
  basic: BASIC,
  standard: STANDARD,
} as const;

// TODO: this is just a quick sample cost formula so we can see this work.
export function compute_cost(
  info: PurchaseInfo
): { cost: number; cost_per_project: number; discounted_cost: number } {
  let {
    quantity,
    user,
    upgrade,
    subscription,
    start,
    end,
    custom_ram,
    custom_cpu,
    custom_disk,
    custom_always_on,
  } = info;
  let cost_per_project = COSTS.basic_cost;
  if (upgrade == "standard") {
    // set custom_* to what they would be:
    custom_ram = STANDARD.ram;
    custom_cpu = STANDARD.cpu;
    custom_disk = STANDARD.disk;
    custom_always_on = !!STANDARD.always_on;
  } else if (upgrade == "basic") {
    custom_ram = BASIC.ram;
    custom_cpu = BASIC.cpu;
    custom_disk = BASIC.disk;
    custom_always_on = !!BASIC.always_on;
  }
  cost_per_project +=
    (custom_ram - COSTS.basic.ram) * COSTS.custom_cost.ram +
    (custom_cpu - COSTS.basic.cpu) * COSTS.custom_cost.cpu +
    (custom_disk - COSTS.basic.disk) * COSTS.custom_cost.disk;
  if (custom_always_on) {
    cost_per_project *= COSTS.custom_cost.always_on;
  }
  cost_per_project *=
    COSTS.user_discount[user] * COSTS.sub_discount[subscription];
  let cost = quantity * cost_per_project;
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
  return {
    cost: Math.max(COSTS.min_sale / COSTS.online_discount, cost),
    discounted_cost: Math.max(COSTS.min_sale, cost * COSTS.online_discount),
    cost_per_project,
  };
}

export function percent_discount(
  cost: number,
  discounted_cost: number
): number {
  return Math.round(100 * (1 - discounted_cost / cost));
}

export function money(n: number): string {
  let s = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
  const i = s.indexOf(".");
  if (i == s.length - 2) {
    s += "0";
  }
  return "USD " + s;
}
