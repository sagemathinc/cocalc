import { Icon } from "@cocalc/frontend/components/icon";
import { AVG_MONTH_DAYS } from "@cocalc/util/consts/billing";
import { untangleUptime } from "@cocalc/util/consts/site-license";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { dedicatedPrice } from "@cocalc/util/licenses/purchase/dedicated-price";
import { CostInputPeriod, PurchaseInfo, Subscription } from "@cocalc/util/licenses/purchase/types";
import {
  compute_cost,
  money,
  percent_discount,
} from "@cocalc/util/licenses/purchase/util";
import { plural } from "@cocalc/util/misc";
import { getDays } from "@cocalc/util/stripe/timecalcs";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import {
  ComputeCostProps,
} from "@cocalc/util/upgrades/shopping";
import {
  dedicatedDiskDisplay,
  dedicatedVmDisplay,
} from "@cocalc/util/upgrades/utils";
import Timestamp from "components/misc/timestamp";
import { ReactNode } from "react";

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
  const price = dedicatedPrice({
    dedicated_disk,
    subscription: "monthly",
  });
  if (price == null) return;
  return {
    cost: price,
    cost_per_unit: price,
    discounted_cost: price,
    cost_per_project_per_month: price,
    cost_sub_month: price,
    cost_sub_year: 12 * price,
    input: {
      subscription: props.period,
      ...props,
    },
    period: "monthly",
  };
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
      if (props.type === "disk" || props.type === "vm")
        throw Error("must be a quota upgrade license");
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
        start: range?.[0] ?? new Date(),
        end: range?.[1],
        custom_ram: ram,
        custom_dedicated_ram: 0,
        custom_cpu: cpu,
        custom_dedicated_cpu: 0,
        custom_disk: disk,
        custom_always_running: always_running,
        custom_member: member,
        custom_uptime: uptime,
        boost,
      };
      return {
        ...compute_cost(input),
        input,
        period,
      };
  }
}

interface Props {
  cost: CostInputPeriod;
  simple?: boolean;
  oneLine?: boolean;
}

export function DisplayCost({ cost, simple, oneLine }: Props) {
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

  if (info.type !== "quota")
    throw Error("at this point, we only deal with type=quota");
  if (info.custom_uptime == null || info.quantity == null)
    throw new Error("should not happen");
  const { always_running, idle_timeout } = untangleUptime(info.custom_uptime);
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

export function describePeriod({
  subscription,
  start,
  end,
}: {
  subscription?: Omit<Subscription, "no">;
  start?: Date | string;
  end?: Date | string;
}): ReactNode {
  if (subscription == "no") {
    if (start == null || end == null) throw new Error(`start date not set!`);
    const days = getDays({ start, end });
    return (
      <>
        <Timestamp dateOnly datetime={start} absolute /> to{" "}
        <Timestamp dateOnly datetime={end} absolute />, {days} days
      </>
    );
  } else {
    return `${subscription} subscription`;
  }
}
