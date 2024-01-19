/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ONE_MONTH_MS } from "@cocalc/util/consts/billing";
import {
  LicenseIdleTimeouts,
  requiresMemberhosting,
} from "@cocalc/util/consts/site-license";
import { BASIC, COSTS, GCE_COSTS, MAX, STANDARD } from "./consts";
import { dedicatedPrice } from "./dedicated-price";
import { Cost, PurchaseInfo } from "./types";

export function compute_cost(info: PurchaseInfo): Cost {
  if (info.type === "disk" || info.type === "vm") {
    return compute_cost_dedicated(info);
  }

  if (info.type !== "quota") {
    throw new Error(`can only compute cost for type=quota`);
  }

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
    custom_uptime,
  } = info;

  // at this point, we assume the start/end dates are already
  // set to the start/end time of a day in the user's timezone.
  const start = info.start ? new Date(info.start) : undefined;
  const end = info.end ? new Date(info.end) : undefined;

  // dedicated cases above should eliminate an unknown user.
  if (user !== "academic" && user !== "business") {
    throw new Error(`unknown user ${user}`);
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

  let base_cost;

  if (subscription == "no") {
    // Compute license cost for a partial period which has no subscription.
    if (start == null) {
      throw Error("start must be set if subscription=no");
    }
    if (end == null) {
      throw Error("end must be set if subscription=no");
    }
  } else if (subscription == "yearly") {
    // If we're computing the cost for an annual subscription, multiply the monthly subscription
    // cost by 12.
    base_cost = 12 * cost_per_project_per_month;
  } else if (subscription == "monthly") {
    base_cost = cost_per_project_per_month;
  } else {
    throw Error(
      "BUG -- a subscription must be yearly or monthly or a partial period",
    );
  }
  if (start != null && end != null) {
    // In all cases -- subscription or not -- if the start and end dates are
    // explicitly set, then we compute the cost over the given period.  This
    // does not impact cost_sub_month or cost_sub_year.
    const months = (end.valueOf() - start.valueOf()) / ONE_MONTH_MS;
    base_cost = months * cost_per_project_per_month;
  }

  // cost_per_unit is important for purchasing upgrades for specific intervals.
  // i.e. above the "cost" is calculated for the total number of projects,
  // note: later on you have to use round2, since this is the price with full precision.
  const cost_per_unit = base_cost;
  const cost_total = quantity * cost_per_unit;

  return {
    cost_per_unit,
    cost: cost_total,
    discounted_cost: cost_total * COSTS.online_discount,
    cost_per_project_per_month,
    // attn: cost_sub* will be multiplied by the online discount in
    // server/licenses/purchase/charge.ts
    cost_sub_month,
    cost_sub_year,
  };
}

// cost-object for dedicated resource – there are no discounts whatsoever
export function compute_cost_dedicated(info) {
  const { price, monthly } = dedicatedPrice(info);
  return {
    cost: price,
    cost_per_unit: price,
    discounted_cost: price,
    cost_per_project_per_month: monthly, // dedicated is always only 1 project
    cost_sub_month: monthly,
    cost_sub_year: 12 * monthly,
    period: info.subscription,
  };
}
