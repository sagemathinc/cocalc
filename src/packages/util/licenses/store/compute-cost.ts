/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import type {
  CostInputPeriod,
  PurchaseInfo,
} from "@cocalc/util/licenses/purchase/types";
import { fixRange } from "@cocalc/util/licenses/purchase/purchase-info";
import type { ComputeCostProps } from "@cocalc/util/upgrades/shopping";
import { CURRENT_VERSION } from "@cocalc/util/licenses/purchase/consts";
import { decimalMultiply } from "@cocalc/util/stripe/calc";
import { FAIR_CPU_MODE } from "@cocalc/util/upgrade-spec";

function computeCashVoucherPrice(props: ComputeCostProps) {
  if (props.type != "cash-voucher") {
    throw Error("BUG");
  }
  const cost_per_unit = props.whenPay == "admin" ? 0 : props.amount;
  const quantity = props.numVouchers ?? 1;
  const cost = decimalMultiply(cost_per_unit, quantity);
  return {
    // a lot of this is mainly for typescript.
    cost,
    cost_per_unit,
    input: {
      ...props,
      subscription: "no",
    },
    period: "range",
    cost_per_project_per_month: 0,
    cost_sub_month: 0,
    cost_sub_year: 0,
    quantity,
  } as const;
}

export function computeCost(
  props: ComputeCostProps,
  noRangeShift?: boolean,
): CostInputPeriod | undefined {
  if (props.type === "cash-voucher") {
    return computeCashVoucherPrice(props);
  }

  const {
    user,
    run_limit,
    period,
    range,
    ram,
    disk,
    always_running,
    member,
    uptime,
    boost = false, // if true, allow "all zero" values and start at 0 USD
  } = props;
  const cpu = FAIR_CPU_MODE ? 1 : props.cpu;

  if (period == "range" && range?.[1] == null) {
    return undefined;
  }

  if (run_limit == null) {
    return undefined;
  }

  const input: PurchaseInfo = {
    version: CURRENT_VERSION,
    type: "quota",
    user,
    upgrade: "custom" as "custom",
    quantity: run_limit,
    subscription: (period == "range" ? "no" : period) as
      | "no"
      | "monthly"
      | "yearly",
    custom_ram: ram,
    custom_dedicated_ram: 0,
    custom_cpu: cpu,
    custom_dedicated_cpu: 0,
    custom_disk: disk,
    custom_always_running: always_running,
    custom_member: member,
    custom_uptime: uptime,
    boost,
    // For computing the *shopping cart checkout price* of a subscription,
    // we remove the endpoints data.  Otherwise, compute_cost(input).cost
    // returns the price for that exact interval, not the generic monthly
    // cost, since compute_cost is also used for refunds/value computations
    // (though we never do prorated refunds of subscriptions anymore!).
    // In particular, we only include start/end dates for explicit ranges.
    ...(period == "range"
      ? fixRange(range, period, noRangeShift)
      : { start: null, end: null }),
  };

  return {
    ...compute_cost(input),
    input,
    period,
  };
}
