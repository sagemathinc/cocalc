import {
  compute_cost,
  percent_discount,
  money,
  Cost as Cost0,
  Subscription,
  PurchaseInfo,
} from "@cocalc/util/licenses/purchase/util";
import { Icon } from "@cocalc/frontend/components/icon";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { plural } from "@cocalc/util/misc";
import { ReactNode } from "react";
import Timestamp from "components/misc/timestamp";
import {
  LicenseIdleTimeouts,
  untangleUptime,
} from "@cocalc/util/consts/site-license";
import { getDays } from "@cocalc/util/stripe/timecalcs";

export type Period = "range" | "monthly" | "yearly";

export interface Cost extends Cost0 {
  input: any;
  period: Period;
}

export function computeCost({
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
}: {
  user: "academic" | "business";
  run_limit: number;
  period: Period;
  range: [Date | undefined, Date | undefined];
  ram: number;
  cpu: number;
  disk: number;
  always_running: boolean;
  member: boolean;
  input: PurchaseInfo;
  uptime: keyof typeof LicenseIdleTimeouts | "always_running";
}): Cost | undefined {
  if (period == "range" && range?.[1] == null) {
    return undefined;
  }

  const input = {
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
  };
  return {
    ...compute_cost(input),
    input,
    period,
  };
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

export function describeItem(info: PurchaseInfo): ReactNode {
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
  subscription: Subscription;
  start: Date | string;
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
