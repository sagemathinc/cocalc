/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { untangleUptime } from "@cocalc/util/consts/site-license";
import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import {
  CostInputPeriod,
  PurchaseInfo,
  Subscription,
} from "@cocalc/util/licenses/purchase/types";
import { money, percent_discount } from "@cocalc/util/licenses/purchase/utils";
import { plural } from "@cocalc/util/misc";
import { appendAfterNowToDate, getDays } from "@cocalc/util/stripe/timecalcs";
import {
  dedicatedDiskDisplay,
  dedicatedVmDisplay,
} from "@cocalc/util/upgrades/utils";
import Timestamp from "components/misc/timestamp";
import { ReactNode } from "react";
import { useTimeFixer } from "./util";
import { roundToMidnight } from "@cocalc/util/stripe/timecalcs";

interface Props {
  cost: CostInputPeriod;
  simple?: boolean;
  oneLine?: boolean;
}

export function DisplayCost(props: Props) {
  const { cost, simple, oneLine } = props;
  if (isNaN(cost.cost) || isNaN(cost.discounted_cost)) {
    return <>&ndash;</>;
  }
  const discount_pct = percent_discount(cost);
  if (simple) {
    return (
      <>
        {money(cost.discounted_cost)}
        {cost.period != "range" ? (
          <>
            {oneLine ? " " : <br />}
            {cost.period}
          </>
        ) : (
          ""
        )}
        {oneLine ? null : <br />}{" "}
        {discount_pct > 0 && (
          <>(includes {discount_pct}% self-service discount)</>
        )}
      </>
    );
  }
  let desc;
  if (cost.discounted_cost < cost.cost) {
    desc = (
      <>
        <span style={{ textDecoration: "line-through" }}>
          {money(cost.cost)}
        </span>
        {" or "}
        <b>
          {money(cost.discounted_cost)}
          {cost.input.subscription != "no" ? " " + cost.input.subscription : ""}
        </b>
        , if you purchase here ({discount_pct}% self-service discount).
      </>
    );
  } else {
    desc = `${money(cost.cost)} ${cost.period != "range" ? cost.period : ""}`;
  }

  return (
    <span>
      {describeItem(cost.input)}
      <hr />
      <Icon name="money-check" /> Cost: {desc}
    </span>
  );
}

export function describeItem(info: Partial<PurchaseInfo>): ReactNode {
  if (info.type === "disk") {
    return (
      <>
        Dedicated Disk ({dedicatedDiskDisplay(info.dedicated_disk)}){" "}
        {describePeriod(info)}
      </>
    );
  }

  if (info.type === "vm") {
    return (
      <>
        Dedicated VM ({dedicatedVmDisplay(info.dedicated_vm)}){" "}
        {describePeriod(info)}
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
    info.custom_uptime ?? "short"
  );
  return (
    <>
      {describe_quota({
        ram: info.custom_ram,
        cpu: info.custom_cpu,
        disk: info.custom_disk,
        always_running,
        idle_timeout,
        member: info.custom_member,
        user: info.user,
      })}{" "}
      {describeQuantity(info)} ({describePeriod(info)})
    </>
  );
}

function describeQuantity({ quantity = 1 }: { quantity?: number }): ReactNode {
  return `for ${quantity} running ${plural(quantity, "project")}`;
}

interface PeriodProps {
  subscription?: Omit<Subscription, "no">;
  start?: Date | string;
  end?: Date | string;
}

/**
 * ATTN: this is not a general purpose period description generator. It's very specific to the purchases in the store!
 */
export function describePeriod(props: PeriodProps): ReactNode {
  const { subscription, start: startRaw, end: endRaw } = props;

  const { fromServerTime, serverTimeDate } = useTimeFixer();

  if (subscription == "no") {
    if (startRaw == null || endRaw == null)
      throw new Error(`start date not set!`);
    // we do not use startOfDay and endOfDay, because this was already
    // done in "usage-and-duration::fixRangeSelector"
    // rather, we calculate back to the user's offset
    const start = roundToMidnight(fromServerTime(startRaw), "start");
    const end = roundToMidnight(fromServerTime(endRaw), "end");

    if (start == null || end == null) {
      throw new Error(`this should never happen`);
    }

    // days are calculated based on the actual selection
    const days = getDays({ start, end });

    // but the displayed end mimics what will happen later on the backend
    // i.e. if the day alreaday started, we append the already elapsed period to the end
    const endDisplay = appendAfterNowToDate({
      now: serverTimeDate,
      start,
      end,
    });

    return (
      <>
        <Timestamp dateOnly datetime={start} absolute /> to{" "}
        <Timestamp dateOnly datetime={endDisplay} absolute />, {days}{" "}
        {plural(days, "day")}
      </>
    );
  } else {
    return `${subscription} subscription`;
  }
}
