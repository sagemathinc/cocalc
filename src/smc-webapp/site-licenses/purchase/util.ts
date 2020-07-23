/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { isEqual } from "lodash";

export type User = "academic" | "business";
export type Upgrade = "basic" | "standard" | "max" | "custom";
export type Subscription = "no" | "monthly" | "yearly";
export type CustomUpgrades =
  | "ram"
  | "cpu"
  | "disk"
  | "always_running"
  | "member";

export interface Cost {
  cost: number;
  discounted_cost: number;
  cost_per_project_per_month: number;
  cost_sub_month: number;
  cost_sub_year: number;
}

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
  cost?: Cost;
  custom_ram: number;
  custom_cpu: number;
  custom_disk: number;
  custom_always_running: boolean;
  custom_member: boolean;
}

// throws an exception if it spots something funny...
export function sanity_checks(info: PurchaseInfo) {
  if (typeof info != "object") {
    throw Error("must be an object");
  }
  if (info.start == null) {
    throw Error("must have start date set");
  }
  if (info.subscription == "no") {
    if (info.start == null || info.end == null) {
      throw Error(
        "start and end dates must both be given if not a subscription"
      );
    }
    const days = Math.round(
      (info.end.valueOf() - info.start.valueOf()) / (24 * 60 * 60 * 1000)
    );
    if (days <= 0) {
      throw Error("end date must be at least one day after start date");
    }
  }

  for (const x of ["ram", "cpu", "disk"]) {
    const field = "custom_" + x;
    if (typeof info[field] != "number") {
      throw Error(`field "${field}" must be number`);
    }
    if (info[field] < 1 || info[field] > MAX[field]) {
      throw Error(`field "${field}" too small or too big`);
    }
  }

  for (const x of ["always_running", "member"]) {
    const field = "custom_" + x;
    if (typeof info[field] != "boolean") {
      throw Error(`field "${field}" must be boolean`);
    }
  }

  if (!isEqual(info.cost, compute_cost(info))) {
    throw Error("cost does not match");
  }
}

// discount is the number we multiply the price by:

// TODO: move the actual **data** that defines this cost map to the database
// and admin site settings.  It must be something that we can change at any time,
// and that somebody else selling cocalc would set differently.

// See https://cloud.google.com/compute/vm-instance-pricing#e2_custommachinetypepricing
// for the monthly GCE prices
export const GCE_COSTS = {
  ram: 0.67, // for pre-emptibles
  cpu: 5, // for pre-emptibles
  disk: 0.04, // per GB/month
  non_pre_factor: 3.5, // Roughly Google's factor for non-preemptible's
};

// Our price = GCE price times this.  We charge LESS than Google VM's, due to our gamble
// on having multiple users on a node at once.
const COST_MULTIPLIER = 0.75;
// We gamble that projects are packed at least twice as densely on non-member
// nodes (it's often worse).
const NONMEMBER_DENSITY = 2;
// Changing this doesn't change the actual academic prices --
// it just changes the *business* prices.
const ACADEMIC_DISCOUNT = 0.6;
// Disk factor is based on how many copies of user data we have, plus guesses about
// bandwidth to transfer data around (to/from cloud storage, backblaze, etc.).
// 10 since we have about that many copies of user data, plus snapshots, and
// we store their data long after they stop paying...
const DISK_FACTOR = 10;

// Extra charge if project will always be on. Really we are gambling that
// projects that are not always on, are off much of the time (at least 50%).
// We use this factor since a 50-simultaneous active projects license could
// easily be used about half of the time during a week in a large class.
const ALWAYS_RUNNING_FACTOR = 2;

// Another gamble implicit in this is that pre's are available.  When they
// aren't, cocalc.com switches to uses MUCH more expensive non-preemptibles.

const CUSTOM_COST = {
  ram:
    (COST_MULTIPLIER * GCE_COSTS.ram) / ACADEMIC_DISCOUNT / NONMEMBER_DENSITY,
  cpu:
    (COST_MULTIPLIER * GCE_COSTS.cpu) / ACADEMIC_DISCOUNT / NONMEMBER_DENSITY,
  disk: (DISK_FACTOR * COST_MULTIPLIER * GCE_COSTS.disk) / ACADEMIC_DISCOUNT,
  always_running: ALWAYS_RUNNING_FACTOR,
  member: NONMEMBER_DENSITY,
} as const;
const BASIC = {
  ram: 1,
  cpu: 1,
  disk: 1,
  always_running: 0,
  member: 1,
} as const;
const STANDARD = {
  ram: 2,
  cpu: 2,
  disk: 3,
  always_running: 0,
  member: 1,
} as const;
const MAX = {
  ram: 16,
  cpu: 4,
  disk: 20,
  always_running: 1,
  member: 1,
} as const;
export const COSTS: {
  user_discount: { [user in User]: number };
  sub_discount: { [sub in Subscription]: number };
  online_discount: number;
  min_quote: number;
  min_sale: number;
  custom_cost: { [key in CustomUpgrades]: number };
  custom_max: { [key in CustomUpgrades]: number };
  basic: { [key in CustomUpgrades]: number };
  standard: { [key in CustomUpgrades]: number };
  max: { [key in CustomUpgrades]: number };
} = {
  user_discount: { academic: ACADEMIC_DISCOUNT, business: 1 },
  sub_discount: { no: 1, monthly: 0.9, yearly: 0.85 },
  online_discount: 0.75,
  min_quote: 100,
  min_sale: 1,
  custom_cost: CUSTOM_COST,
  custom_max: MAX,
  basic: BASIC,
  standard: STANDARD,
  max: MAX,
} as const;

export function compute_cost(info: PurchaseInfo): Cost {
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
    custom_always_running,
    custom_member,
  } = info;
  if (upgrade == "standard") {
    // set custom_* to what they would be:
    custom_ram = STANDARD.ram;
    custom_cpu = STANDARD.cpu;
    custom_disk = STANDARD.disk;
    custom_always_running = !!STANDARD.always_running;
    custom_member = !!STANDARD.member;
  } else if (upgrade == "basic") {
    custom_ram = BASIC.ram;
    custom_cpu = BASIC.cpu;
    custom_disk = BASIC.disk;
    custom_always_running = !!BASIC.always_running;
    custom_member = !!BASIC.member;
  } else if (upgrade == "max") {
    custom_ram = MAX.ram;
    custom_cpu = MAX.cpu;
    custom_disk = MAX.disk;
    custom_always_running = !!MAX.always_running;
    custom_member = !!MAX.member;
  }

  // We compute the cost for one project for one month.
  // First we add the cost for RAM and CPU.
  let cost_per_project_per_month =
    custom_ram * COSTS.custom_cost.ram + custom_cpu * COSTS.custom_cost.cpu;
  // If the project is always one, multiply the RAM/CPU cost by a factor.
  if (custom_always_running) {
    cost_per_project_per_month *= COSTS.custom_cost.always_running;
    if (custom_member) {
      // if it is member hosted and always on, we absolutely can't ever use
      // pre-emptible for this project.  On the other hand,
      // always on non-member means it gets restarted whenever the
      // pre-empt gets killed, which is still potentially very useful
      // for long-running computations that can be checkpointed and started.
      cost_per_project_per_month *= GCE_COSTS.non_pre_factor;
    }
  }
  // If the project is member hosted, multiply the RAM/CPU cost by a factor.
  if (custom_member) {
    cost_per_project_per_month *= COSTS.custom_cost.member;
  }
  // Add the disk cost, which doesn't depend on how frequently the project
  // is used or the quality of hosting.
  cost_per_project_per_month += custom_disk * COSTS.custom_cost.disk;

  // It's convenient in all cases to have the actual amount we will be
  // for both monthly and early available (used by backend for setting up
  // stripe products).
  const cost_sub_month =
    cost_per_project_per_month *
    COSTS.user_discount[user] *
    COSTS.sub_discount["monthly"];
  const cost_sub_year =
    cost_per_project_per_month *
    12 *
    COSTS.user_discount[user] *
    COSTS.sub_discount["yearly"];

  // Now give the academic and subscription discounts:
  cost_per_project_per_month *=
    COSTS.user_discount[user] * COSTS.sub_discount[subscription];

  // Multiply by the number of projects:
  let cost = quantity * cost_per_project_per_month;

  // Make cost properly account for period of purchase or subscription.
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
    cost_per_project_per_month,
    cost_sub_month,
    cost_sub_year,
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
