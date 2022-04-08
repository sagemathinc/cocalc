/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ONE_MONTH_MS } from "@cocalc/util/consts/billing";
import {
  DedicatedDisk,
  DedicatedDiskTypeNames,
  DedicatedVM,
} from "@cocalc/util/types/dedicated";
import { isEqual } from "lodash";
import {
  LicenseIdleTimeouts,
  requiresMemberhosting,
  Uptime,
} from "../../consts/site-license";
import { MAX_DEDICATED_DISK_SIZE, PRICES } from "../../upgrades/dedicated";
import { dedicatedPrice } from "./dedicated";

export type User = "academic" | "business";
export type Upgrade = "basic" | "standard" | "max" | "custom";
export type Subscription = "no" | "monthly" | "yearly";
export type CustomUpgrades =
  | "ram"
  | "dedicated_ram"
  | "cpu"
  | "dedicated_cpu"
  | "disk"
  | "always_running"
  | "member";

export interface Cost {
  cost: number;
  cost_per_unit: number;
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
  start: Date | string;
  end?: Date | string;
  quote?: boolean;
  quote_info?: string;
  payment_method?: string;
  cost?: Cost;
  custom_ram: number;
  custom_dedicated_ram: number;
  custom_cpu: number;
  custom_dedicated_cpu: number;
  custom_disk: number;
  custom_member: boolean;
  custom_uptime: Uptime;
  dedicated_disk?: DedicatedDisk;
  dedicated_vm?: DedicatedVM;
  title?: string;
  description?: string;
}

// stripe's metadata can only handle string or number values.
export type ProductMetadata =
  | Record<
      | "user"
      | "ram"
      | "cpu"
      | "dedicated_ram"
      | "dedicated_cpu"
      | "disk"
      | "uptime"
      | "member"
      | "subscription",
      string | number | null
    > & {
      duration_days?: number;
    };

// throws an exception if it spots something funny...
export function sanity_checks(info: PurchaseInfo) {
  if (typeof info != "object") {
    throw Error("must be an object");
  }
  if (info.start == null) {
    throw Error("must have start date set");
  }
  const start = info.start ? new Date(info.start) : undefined;
  const end = info.end ? new Date(info.end) : undefined;
  if (info.subscription == "no") {
    if (start == null || end == null) {
      throw Error(
        "start and end dates must both be given if not a subscription"
      );
    }

    const days = Math.round(
      (end.valueOf() - start.valueOf()) / (24 * 60 * 60 * 1000)
    );
    if (days <= 0) {
      throw Error("end date must be at least one day after start date");
    }
  }

  for (const x of ["ram", "cpu", "disk", "dedicated_ram", "dedicated_cpu"]) {
    const field = "custom_" + x;
    if (typeof info[field] !== "number") {
      throw Error(`field "${field}" must be number`);
    }
    if (info[field] < 0 || info[field] > MAX[field]) {
      throw Error(`field "${field}" too small or too big`);
    }
  }

  if (info.dedicated_vm != null) {
    const vmName = info.dedicated_vm;
    if (typeof vmName !== "string")
      throw new Error(`field dedicated_vm must be string`);
    if (PRICES.vms[vmName] == null)
      throw new Error(`field dedicated_vm ${vmName} not found`);
  }

  if (info.dedicated_disk != null) {
    const dd = info.dedicated_disk;
    if (typeof dd === "object") {
      const { size_gb, type } = dd;
      if (typeof size_gb !== "number") {
        throw new Error(`field dedicated_disk.size must be number`);
      }
      if (size_gb < 0 || size_gb > MAX_DEDICATED_DISK_SIZE) {
        throw new Error(`field dedicated_disk.size_gb < 0 or too big`);
      }
      if (typeof type !== "string" || !DedicatedDiskTypeNames.includes(type))
        throw new Error(
          `field dedicated_disk.type must be string and one of ${DedicatedDiskTypeNames.join(
            ", "
          )}`
        );
    }
  }

  if (info.custom_uptime == null || typeof info.custom_uptime !== "string") {
    throw new Error(`field "custom_uptime" must be set`);
  }

  if (
    LicenseIdleTimeouts[info.custom_uptime] == null &&
    info.custom_uptime != ("always_running" as Uptime)
  ) {
    const tos = Object.keys(LicenseIdleTimeouts).join(", ");
    throw new Error(
      `field "custom_uptime" must be one of ${tos} or "always_running"`
    );
  }

  for (const x of ["member"]) {
    const field = "custom_" + x;
    if (typeof info[field] !== "boolean") {
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

const CUSTOM_COST = {
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
const BASIC = {
  ram: 1,
  cpu: 1,
  disk: 1,
  dedicated_ram: 0,
  dedicated_cpu: 0,
  always_running: 0,
  member: 1,
} as const;
const STANDARD = {
  ram: 2,
  cpu: 2,
  dedicated_ram: 0,
  dedicated_cpu: 0,
  disk: 3,
  always_running: 0,
  member: 1,
} as const;
const MAX = {
  ram: 16,
  cpu: 3,
  dedicated_ram: 8,
  dedicated_cpu: 2,
  disk: 20,
  always_running: 1,
  member: 1,
} as const;
export const MIN_QUOTE = 100;
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
  min_quote: MIN_QUOTE,
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
    custom_ram,
    custom_cpu,
    custom_dedicated_ram,
    custom_dedicated_cpu,
    custom_disk,
    custom_member,
    dedicated_disk,
    dedicated_vm,
    custom_uptime,
  } = info;

  // at this point, we assume the start/end dates are already
  // set to the start/end time of a day in the user's timezone.
  const start = new Date(info.start);
  const end = info.end ? new Date(info.end) : undefined;

  // TODO this is just a sketch, improve it
  if (!!dedicated_disk || !!dedicated_vm) {
    const cost = dedicatedPrice({
      start,
      end,
      subscription,
      dedicated_disk,
      dedicated_vm,
    });
    if (cost == null) {
      throw new Error("Problem calculating dedicated price");
    }
    return {
      cost,
      cost_per_unit: cost,
      discounted_cost: cost,
      cost_per_project_per_month: 0,
      cost_sub_month: 0,
      cost_sub_year: 0,
    };
  }

  // this is set in the next if/else block
  let custom_always_running = false;
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
    custom_dedicated_ram = MAX.dedicated_ram;
    custom_dedicated_cpu = MAX.dedicated_cpu;
    custom_disk = MAX.disk;
    custom_always_running = !!MAX.always_running;
    custom_member = !!MAX.member;
  } else {
    custom_always_running = custom_uptime === "always_running";
  }

  // member hosting is controlled by uptime
  if (custom_always_running !== true && requiresMemberhosting(custom_uptime)) {
    custom_member = true;
  }

  // We compute the cost for one project for one month.
  // First we add the cost for RAM and CPU.
  let cost_per_project_per_month =
    custom_ram * COSTS.custom_cost.ram +
    custom_cpu * COSTS.custom_cost.cpu +
    custom_dedicated_ram * COSTS.custom_cost.dedicated_ram +
    custom_dedicated_cpu * COSTS.custom_cost.dedicated_cpu;
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
  } else {
    // multiply by the idle_timeout factor
    // the smallest idle_timeout has a factor of 1
    const idle_timeout_spec = LicenseIdleTimeouts[custom_uptime];
    if (idle_timeout_spec != null) {
      cost_per_project_per_month *= idle_timeout_spec.priceFactor;
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
  // for both monthly and yearly available (used by backend for setting up
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

  let base_cost = cost_per_project_per_month;

  // Make cost properly account for period of purchase or subscription.
  if (subscription == "no") {
    if (end == null) {
      throw Error("end must be set if subscription is no");
    }
    // scale by factor of a month
    const months = (end.valueOf() - start.valueOf()) / ONE_MONTH_MS;
    base_cost *= months;
  } else if (subscription == "yearly") {
    base_cost *= 12;
  }

  // cost_per_unit is important for purchasing upgrades for specific intervals.
  // i.e. above the "cost" is calculated for the total number of projects,
  // then here in "cost" the price is limited by the min_sale amount,
  // and later in charge/stripeCreatePrice, we did divide by the number of projects again.
  // instead: we use the limited cost_per_unit price to create a price in stripe.
  // and hence there is no implicit discount if you purchase several projects at once.
  // note: later on you have to use round2, since this is the price with full precision.
  const cost_per_unit = Math.max(
    COSTS.min_sale / COSTS.online_discount,
    base_cost
  );

  const cost_total = quantity * cost_per_unit;

  return {
    cost_per_unit,
    cost: cost_total,
    discounted_cost: Math.max(
      COSTS.min_sale,
      cost_total * COSTS.online_discount
    ),
    cost_per_project_per_month,
    cost_sub_month,
    cost_sub_year,
  };
}

export function percent_discount({
  cost,
  discounted_cost,
}: Pick<Cost, "cost" | "discounted_cost">): number {
  return Math.round(100 * (1 - discounted_cost / cost));
}

export function money(n: number, hideCurrency: boolean = false): string {
  let s = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
  const i = s.indexOf(".");
  if (i == s.length - 2) {
    s += "0";
  }
  return (hideCurrency ? "" : "USD ") + s;
}

export const discount_pct = Math.round(
  (1 - COSTS.user_discount["academic"]) * 100
);

export const discount_monthly_pct = Math.round(
  (1 - COSTS.sub_discount["monthly"]) * 100
);

export const discount_yearly_pct = Math.round(
  (1 - COSTS.sub_discount["yearly"]) * 100
);
