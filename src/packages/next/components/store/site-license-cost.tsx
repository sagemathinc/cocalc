/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { untangleUptime } from "@cocalc/util/consts/site-license";
import {
  describeQuotaOnLine,
  describe_quota,
} from "@cocalc/util/licenses/describe-quota";
import type {
  CostInputPeriod,
  PurchaseInfo,
  Subscription,
} from "@cocalc/util/licenses/purchase/types";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { plural, round2, round2up } from "@cocalc/util/misc";
import { appendAfterNowToDate, getDays } from "@cocalc/util/stripe/timecalcs";
import { WORKSPACE_LABEL } from "@cocalc/util/i18n/terminology";
import Timestamp, { processTimestamp } from "components/misc/timestamp";
import { ReactNode } from "react";
import { useTimeFixer } from "./util";
import { Tooltip, Typography } from "antd";
import { currency } from "@cocalc/util/misc";
const { Text } = Typography;
import { periodicCost } from "@cocalc/util/licenses/purchase/compute-cost";
import { decimalMultiply } from "@cocalc/util/stripe/calc";

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

// TODO: this should be a component. Rename it to DescribeItem and use it
// properly, e.g., <DescribeItem info={cost.input}/> above.

export function describeItem({
  info,
  variant = "long",
  voucherPeriod,
}: DescribeItemProps): ReactNode {
  if (info.type == "cash-voucher") {
    // see also packages/util/upgrades/describe.ts for text version of this
    // that appears on invoices.
    return (
      <>
        {info.numVouchers ?? 1} {plural(info.numVouchers ?? 1, "Voucher Code")}{" "}
        {info.numVouchers > 1 ? " each " : ""} worth{" "}
        {currency(info.amount)}. Total Value:{" "}
        {currency(decimalMultiply(info.amount, info.numVouchers ?? 1))}
        {info.whenPay == "admin" ? " (admin: no charge)" : ""}
      </>
    );
  }
  if (info.type !== "quota") {
    throw Error("at this point, we only deal with type=quota");
  }

  if (info.quantity == null) {
    throw new Error("should not happen");
  }

  const { always_running, idle_timeout } = untangleUptime(
    info.custom_uptime ?? "short",
  );

  const quota = {
    ram: info.custom_ram,
    cpu: info.custom_cpu,
    disk: info.custom_disk,
    always_running,
    idle_timeout,
    member: info.custom_member,
    user: info.user,
  };

  if (variant === "short") {
    return (
      <>
        <Text strong={true}>{describeQuantity({ quota: info, variant })}</Text>{" "}
        {describeQuotaOnLine(quota)},{" "}
        {describePeriod({ quota: info, variant, voucherPeriod })}
      </>
    );
  } else {
    return (
      <>
        {describe_quota(quota, false)}{" "}
        {describeQuantity({ quota: info, variant })} (
        {describePeriod({ quota: info, variant, voucherPeriod })})
      </>
    );
  }
}

interface DescribeQuantityProps {
  quota: Partial<PurchaseInfo>;
  variant?: "short" | "long";
}

function describeQuantity(props: DescribeQuantityProps): ReactNode {
  const { quota: info, variant = "long" } = props;
  const { quantity = 1 } = info;

  if (variant === "short") {
    return `${quantity}x`;
  } else {
    return `for ${quantity} running ${plural(
      quantity,
      WORKSPACE_LABEL.toLowerCase(),
    )}`;
  }
}

interface PeriodProps {
  quota: {
    subscription?: Omit<Subscription, "no">;
    start?: Date | string | null;
    end?: Date | string | null;
  };
  variant?: "short" | "long";
  // voucherPeriod: description used for a voucher -- just give number of days, since the exact dates themselves are discarded.
  voucherPeriod?: boolean;
}

/**
 * ATTN: this is not a general purpose period description generator. It's very specific
 * to the purchases in the store!
 */
export function describePeriod({
  quota,
  variant = "long",
  voucherPeriod,
}: PeriodProps): ReactNode {
  const { subscription, start: startRaw, end: endRaw } = quota;

  const { fromServerTime, serverTimeDate } = useTimeFixer();

  if (subscription == "no") {
    if (startRaw == null || endRaw == null)
      throw new Error(`start date not set!`);
    const start = fromServerTime(startRaw);
    const end = fromServerTime(endRaw);

    if (start == null || end == null) {
      throw new Error(`this should never happen`);
    }

    // days are calculated based on the actual selection
    const days = round2(getDays({ start, end }));

    if (voucherPeriod) {
      return (
        <>
          license lasts {days} {plural(days, "day")}
        </>
      );
    }

    // but the displayed end mimics what will happen later on the backend
    // i.e. if the day already started, we append the already elapsed period to the end
    const endDisplay = appendAfterNowToDate({
      now: serverTimeDate,
      start,
      end,
    });

    if (variant === "short") {
      const tsStart = processTimestamp({ datetime: start, absolute: true });
      const tsEnd = processTimestamp({ datetime: endDisplay, absolute: true });
      if (tsStart === "-" || tsEnd === "-") {
        return "-";
      }
      const timespanStr = `${tsStart.absoluteTimeFull} - ${tsEnd.absoluteTimeFull}`;
      return (
        <Tooltip
          trigger={["hover", "click"]}
          title={timespanStr}
          placement="bottom"
        >
          {`${days} ${plural(days, "day")}`}
        </Tooltip>
      );
    } else {
      return (
        <>
          <Timestamp datetime={start} absolute /> to{" "}
          <Timestamp datetime={endDisplay} absolute />, {days}{" "}
          {plural(days, "day")}
        </>
      );
    }
  } else {
    if (variant === "short") {
      return `${subscription}`;
    } else {
      return `${subscription} subscription`;
    }
  }
}
