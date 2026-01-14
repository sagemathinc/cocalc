/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import type { CostInputPeriod } from "@cocalc/util/purchases/quota/types";
import { money } from "@cocalc/util/purchases/quota/utils";
import { currency, plural, round2up } from "@cocalc/util/misc";
import { periodicCost } from "@cocalc/util/purchases/quota/compute-cost";
import { decimalMultiply } from "@cocalc/util/stripe/calc";
import { ReactNode } from "react";

interface Props {
  cost: CostInputPeriod;
  simple?: boolean;
  oneLine?: boolean;
  simpleShowPeriod?: boolean;
  discountTooltip?: boolean;
  noDiscount?: boolean;
}

export function DisplayCost({
  cost,
  simple = false,
  oneLine = false,
  simpleShowPeriod = true,
}: Props) {
  if (cost == null || isNaN(cost.cost)) {
    return <>&ndash;</>;
  }

  if (simple) {
    return (
      <>
        {cost.cost_sub_first_period != null &&
          cost.cost_sub_first_period != cost.cost && (
            <>
              {" "}
              {money(round2up(cost.cost_sub_first_period))} due today, then
              {oneLine ? <>, </> : <br />}
            </>
          )}
        {money(round2up(periodicCost(cost)))}
        {cost.period != "range" ? (
          <>
            {oneLine ? " " : <br />}
            {simpleShowPeriod && cost.period}
          </>
        ) : (
          ""
        )}
        {oneLine ? null : <br />}{" "}
      </>
    );
  }

  const desc = `${money(round2up(periodicCost(cost)))} ${
    cost.period != "range" ? cost.period : ""
  }`;

  return (
    <span>
      {describeItem({ info: cost.input })}
      <hr />
      <Icon name="money-check" /> Total Cost: {desc}
    </span>
  );
}

interface DescribeItemProps {
  info;
  variant?: "short" | "long";
  voucherPeriod?: boolean;
}

export function describeItem({ info }: DescribeItemProps): ReactNode {
  if (info?.type !== "cash-voucher") {
    return null;
  }
  // see also packages/util/upgrades/describe.ts for text version used in invoices
  return (
    <>
      {info.numVouchers ?? 1} {plural(info.numVouchers ?? 1, "Voucher Code")}{" "}
      {info.numVouchers > 1 ? " each " : ""} worth {currency(info.amount)}. Total
      Value: {currency(decimalMultiply(info.amount, info.numVouchers ?? 1))}
      {info.whenPay == "admin" ? " (admin: no charge)" : ""}
    </>
  );
}
