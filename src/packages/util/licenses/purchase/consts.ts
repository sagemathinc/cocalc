/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CustomUpgrades, Subscription, User } from "./types";
import costVersions from "./cost-versions";

export const CURRENT_VERSION = "3";

// Another gamble implicit in this is that pre's are available.  When they
// aren't, cocalc.com switches to uses MUCH more expensive non-preemptibles.

export interface CostMap {
  ram: number;
  dedicated_ram: number;
  cpu: number;
  dedicated_cpu: number;
  disk: number;
  always_running: number;
  member: number;
}

// BASIC, STANDARD and MAX have nothing to do with defining pricing.  They
// are just some presets that might have been used at some point (?).

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

interface GoogleComputeEngine {
  ram: number;
  cpu: number;
  disk: number;
  non_pre_factor: number;
}

interface CostsStructure {
  version: string;

  // these are critical to defining and computing the cost of a license
  user_discount: { [user in User]: number };
  sub_discount: { [sub in Subscription]: number };
  custom_cost: { [key in CustomUpgrades]: number };
  custom_max: { [key in CustomUpgrades]: number };
  gce: GoogleComputeEngine;

  // not even sure if any of this is ever used anymore -- it's generic.
  min_quote: number;
  basic: { [key in CustomUpgrades]: number };
  standard: { [key in CustomUpgrades]: number };
  max: { [key in CustomUpgrades]: number };
}

export function getCosts(version: string): CostsStructure {
  const {
    SUB_DISCOUNT,
    GCE_COSTS,
    COST_MULTIPLIER,
    NONMEMBER_DENSITY,
    ACADEMIC_DISCOUNT,
    DISK_FACTOR,
    RAM_OVERCOMMIT,
    CPU_OVERCOMMIT,
    ALWAYS_RUNNING_FACTOR,
  } = costVersions[version] ?? costVersions[CURRENT_VERSION];

  const CUSTOM_COST: CostMap = {
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

  return {
    version,

    user_discount: { academic: ACADEMIC_DISCOUNT, business: 1 },
    sub_discount: SUB_DISCOUNT,
    custom_cost: CUSTOM_COST,
    custom_max: MAX,
    gce: GCE_COSTS,

    min_quote: MIN_QUOTE,
    basic: BASIC,
    standard: STANDARD,
    max: MAX,
  } as const;
}

const COSTS = getCosts(CURRENT_VERSION);
export { COSTS };

export const discount_pct = Math.round(
  (1 - COSTS.user_discount["academic"]) * 100,
);

export const discount_monthly_pct = Math.round(
  (1 - COSTS.sub_discount["monthly"]) * 100,
);

export const discount_yearly_pct = Math.round(
  (1 - COSTS.sub_discount["yearly"]) * 100,
);
