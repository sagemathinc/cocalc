import { Icon } from "@cocalc/frontend/components/icon";
import {
  LicenseIdleTimeouts,
  untangleUptime,
} from "@cocalc/util/consts/site-license";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { dedicatedPrice } from "@cocalc/util/licenses/purchase/dedicated";
import {
  compute_cost,
  Cost as Cost0,
  money,
  percent_discount,
  PurchaseInfo,
  Subscription,
} from "@cocalc/util/licenses/purchase/util";
import { plural } from "@cocalc/util/misc";
import { getDays } from "@cocalc/util/stripe/timecalcs";
import { DedicatedDisk, DedicatedVM } from "@cocalc/util/types/dedicated";
import Timestamp from "components/misc/timestamp";
import { ReactNode } from "react";

export type Period = "range" | "monthly" | "yearly";

export interface Cost extends Cost0 {
  input: Partial<PurchaseInfo>;
  period: Period;
}

type ComputeCostProps =
  | {
      type: "quota";
      user: "academic" | "business";
      run_limit: number;
      period: Period;
      range: [Date | undefined, Date | undefined];
      ram: number;
      cpu: number;
      disk: number;
      always_running: boolean;
      member: boolean;
      uptime: keyof typeof LicenseIdleTimeouts | "always_running";
      boost?: boolean;
    }
  | {
      type: "dedicated_vm";
      dedicated_vm?: DedicatedVM;
    }
  | { type: "dedicated_disk"; dedicated_disk?: DedicatedDisk; period: Period };

export function computeCost(props: ComputeCostProps): Cost | undefined {
  switch (props.type) {
    case "dedicated_disk":
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

    case "dedicated_vm":
      const { dedicated_vm } = props;
      return {
        cost: 2.23,
        cost_per_unit: 2.23,
        discounted_cost: 2.23,
        cost_per_project_per_month: 2.23,
        cost_sub_month: 2.23,
        cost_sub_year: 2.23,
        input: { dedicated_vm, subscription: "no" },
        period: "range",
      };

    case "quota":
    default:
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
  cost: Cost;
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
        {oneLine ? null : <br />} (includes {discount_pct}% self-service
        discount)
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
  if (info.dedicated_disk != null) {
    return <>Dedicated Disk, ({describePeriod(info)})</>;
  }

  if (info.dedicated_vm != null) {
    return "Dedicated VM";
  }

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

function describeQuantity({ quantity }: { quantity: number }): ReactNode {
  return `for ${quantity} running ${plural(quantity, "project")}`;
}

export function describePeriod({
  subscription,
  start,
  end,
}: {
  subscription?: Subscription;
  start?: Date | string;
  end?: Date | string;
}): ReactNode {
  if (subscription == "no") {
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
