import {
  compute_cost,
  percent_discount,
  money,
  Cost as Cost0,
} from "@cocalc/util/licenses/purchase/util";
import { Icon } from "@cocalc/frontend/components/icon";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { plural } from "@cocalc/util/misc";

export type Period = "range" | "monthly" | "yearly";

export interface Cost extends Cost0 {
  input: any;
  period: Period;
}

export function computeCost({
  user,
  runLimit,
  period,
  range,
  sharedRam,
  sharedCores,
  disk,
  alwaysRunning,
  member,
}: {
  user: "academic" | "business";
  runLimit: number;
  period: Period;
  range: [Date | undefined, Date | undefined];
  sharedRam: number;
  sharedCores: number;
  disk: number;
  alwaysRunning: boolean;
  member: boolean;
}): Cost | undefined {
  if (period == "range" && range?.[1] == null) {
    return undefined;
  }
  const input = {
    user,
    upgrade: "custom" as "custom",
    quantity: runLimit,
    subscription: (period == "range" ? "no" : period) as
      | "no"
      | "monthly"
      | "yearly",
    start: range?.[0] ?? new Date(),
    end: range?.[1],
    custom_ram: sharedRam,
    custom_dedicated_ram: 0,
    custom_cpu: sharedCores,
    custom_dedicated_cpu: 0,
    custom_disk: disk,
    custom_always_running: alwaysRunning,
    custom_member: member,
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
  if (simple) {
    return (
      <>
        {money(cost.discounted_cost)}
        {cost.period != "range" ? (
          <>
            {oneLine ? null : <br />}
            {cost.period}
          </>
        ) : (
          ""
        )}
        {oneLine ? null : <br />} (includes 25% self-service discount)
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
        , if you purchase here ({percent_discount(cost)}% self-service
        discount).
      </>
    );
  } else {
    desc = `${money(cost.cost)} ${cost.period != "range" ? cost.period : ""}`;
  }

  return (
    <span>
      {describe_quota({
        ram: cost.input.custom_ram,
        cpu: cost.input.custom_cpu,
        disk: cost.input.custom_disk,
        always_running: cost.input.custom_always_running,
        member: cost.input.custom_member,
        user: cost.input.user,
      })}{" "}
      for up to {cost.input.quantity} simultaneous running{" "}
      {plural(cost.input.quantity, "project")}
      <hr />
      <Icon name="money-check" /> Cost: {desc}
    </span>
  );
}
