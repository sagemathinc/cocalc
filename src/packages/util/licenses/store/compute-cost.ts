/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AVG_MONTH_DAYS } from "@cocalc/util/consts/billing";
import {
  compute_cost,
  compute_cost_dedicated,
} from "@cocalc/util/licenses/purchase/compute-cost";
import {
  CostInputPeriod,
  PurchaseInfo,
} from "@cocalc/util/licenses/purchase/types";
import { fixRange } from "@cocalc/util/licenses/purchase/purchase-info";
import { getDays } from "@cocalc/util/stripe/timecalcs";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import type { ComputeCostProps } from "@cocalc/util/upgrades/shopping";

function computeDedicatedDiskCost(
  props: ComputeCostProps
): CostInputPeriod | undefined {
  if (props.type !== "disk") {
    throw new Error("compute cost for disk only");
  }
  if (props.dedicated_disk == null)
    throw new Error("missing props.dedicated_disk");
  const { dedicated_disk } = props;
  if (props.period != "monthly") throw new Error("period must be monthly");
  if (dedicated_disk === false) throw new Error(`should not happen`);

  try {
    return {
      input: { ...props, subscription: props.period },
      ...compute_cost_dedicated({
        dedicated_disk,
        subscription: props.period,
      }),
    };
  } catch (err) {
    console.log(`problem calculating dedicated price: ${err}`);
  }
}

function computeDedicatedVMCost(
  props: ComputeCostProps
): CostInputPeriod | undefined {
  if (props.type !== "vm") {
    throw new Error("compute cost for VM only");
  }
  if (props.dedicated_vm == null) {
    throw new Error("missing props.dedicated_vm");
  }
  const { range, dedicated_vm } = props;
  const machine = dedicated_vm.machine;
  if (range == null || range[0] == null || range[1] == null) return;
  const price_day = PRICES.vms[machine]?.price_day;
  if (price_day == null) return;
  const days = getDays({ start: range[0], end: range[1] });
  const price = days * price_day;
  return {
    cost: price,
    cost_per_unit: price,
    discounted_cost: price,
    cost_per_project_per_month: AVG_MONTH_DAYS * price_day,
    cost_sub_month: AVG_MONTH_DAYS * price_day,
    cost_sub_year: 12 * AVG_MONTH_DAYS * price_day,
    input: {
      ...props,
      subscription: "no",
      start: range[0] ?? new Date(),
      end: range?.[1],
    },
    period: "range",
  };
}

export function computeCost(
  props: ComputeCostProps
): CostInputPeriod | undefined {
  const type = props.type ?? "quota";
  switch (type) {
    case "disk":
      return computeDedicatedDiskCost(props);

    case "vm":
      return computeDedicatedVMCost(props);

    case "quota":
    default:
      if (props.type === "disk" || props.type === "vm") {
        throw Error("must be a quota upgrade license");
      }
      const {
        user,
        run_limit,
        period,
        range,
        ram,
        cpu,
        disk,
        always_running,
        member,
        uptime,
        boost = false, // if true, allow "all zero" values and start at 0 USD
      } = props;

      if (period == "range" && range?.[1] == null) {
        return undefined;
      }

      const input: PurchaseInfo = {
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
        ...fixRange(range, period),
      };
      return {
        ...compute_cost(input),
        input,
        period,
      };
  }
}
