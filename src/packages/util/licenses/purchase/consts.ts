/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CustomUpgrades, Subscription, User } from "./types";

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
// 2022-06: price increase "version 2", from 0.75 → 0.8 to compensate for 15% higher GCE prices
//          and there is also a minimum of 3gb storage (the free base quota) now.
const COST_MULTIPLIER = 0.8;
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

// These are based on what we observe in practice, what works well,
// and what is configured in our backend autoscalers.  This only
// impacts the cost of dedicated cpu and RAM.
const RAM_OVERCOMMIT = 5;
const CPU_OVERCOMMIT = 10;

// Extra charge if project will always be on. Really we are gambling that
// projects that are not always on, are off much of the time (at least 50%).
// We use this factor since a 50-simultaneous active projects license could
// easily be used about half of the time during a week in a large class.
const ALWAYS_RUNNING_FACTOR = 2;

// Another gamble implicit in this is that pre's are available.  When they
// aren't, cocalc.com switches to uses MUCH more expensive non-preemptibles.

interface CostMap {
  ram: number;
  dedicated_ram: number;
  cpu: number;
  dedicated_cpu: number;
  disk: number;
  always_running: number;
  member: number;
}

export const CUSTOM_COST: CostMap = {
  ram:
    (COST_MULTIPLIER * GCE_COSTS.ram) / ACADEMIC_DISCOUNT / NONMEMBER_DENSITY,
  dedicated_ram:
    (RAM_OVERCOMMIT * (COST_MULTIPLIER * GCE_COSTS.ram)) /
    ACADEMIC_DISCOUNT /
    NONMEMBER_DENSITY,
  cpu:
    (COST_MULTIPLIER * GCE_COSTS.cpu) / ACADEMIC_DISCOUNT / NONMEMBER_DENSITY,
  dedicated_cpu:
    (CPU_OVERCOMMIT * (COST_MULTIPLIER * GCE_COSTS.cpu)) /
    ACADEMIC_DISCOUNT /
    NONMEMBER_DENSITY,
  disk: (DISK_FACTOR * COST_MULTIPLIER * GCE_COSTS.disk) / ACADEMIC_DISCOUNT,
  always_running: ALWAYS_RUNNING_FACTOR,
  member: NONMEMBER_DENSITY,
} as const;

export const BASIC: CostMap = {
  ram: 1,
  cpu: 1,
  disk: 3,
  dedicated_ram: 0,
  dedicated_cpu: 0,
  always_running: 0,
  member: 1,
} as const;

export const STANDARD: CostMap = {
  ram: 2,
  cpu: 2,
  dedicated_ram: 0,
  dedicated_cpu: 0,
  disk: 3,
  always_running: 0,
  member: 1,
} as const;

export const MAX: CostMap = {
  ram: 16,
  cpu: 3,
  dedicated_ram: 8,
  dedicated_cpu: 2,
  disk: 20,
  always_running: 1,
  member: 1,
} as const;

export const MIN_QUOTE = 100;

interface CostsStructure {
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
}

export const COSTS: CostsStructure = {
  user_discount: { academic: ACADEMIC_DISCOUNT, business: 1 },
  sub_discount: { no: 1, monthly: 0.9, yearly: 0.85 },
  online_discount: 0.75,
  min_quote: MIN_QUOTE,
  min_sale: 1,
  custom_cost: CUSTOM_COST,
  custom_max: MAX,
  basic: BASIC,
  standard: STANDARD,
  max: MAX,
} as const;

export const discount_pct = Math.round(
  (1 - COSTS.user_discount["academic"]) * 100
);

export const discount_monthly_pct = Math.round(
  (1 - COSTS.sub_discount["monthly"]) * 100
);

export const discount_yearly_pct = Math.round(
  (1 - COSTS.sub_discount["yearly"]) * 100
);
