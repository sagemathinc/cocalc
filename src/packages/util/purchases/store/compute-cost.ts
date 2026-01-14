/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { CostInputPeriod } from "@cocalc/util/purchases/quota/types";
import type { ComputeCostProps } from "@cocalc/util/upgrades/shopping";
import { decimalMultiply } from "@cocalc/util/stripe/calc";

export function computeCost(
  props: ComputeCostProps,
): CostInputPeriod | undefined {
  if (props.type != "cash-voucher") {
    throw Error("BUG: unsupported store product type");
  }

  const cost_per_unit = props.whenPay == "admin" ? 0 : props.amount;
  const quantity = props.numVouchers ?? 1;
  const cost = decimalMultiply(cost_per_unit, quantity);
  return {
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
