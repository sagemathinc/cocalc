import {
  compute_cost,
  percent_discount,
  money,
  Cost as Cost0,
} from "@cocalc/frontend/site-licenses/purchase/util";
import { Icon } from "@cocalc/frontend/components/icon";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";

type Period = "range" | "monthly" | "yearly";

interface Cost extends Cost0 {
  input: any;
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
}): number | undefined {
  if (period == "range" && range?.[1] == null) {
    return undefined;
  }
  const input = {
    user,
    upgrade: "custom",
    quantity: runLimit,
    subscription: period == "range" ? "no" : period,
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
  };
}

interface Props {
  cost: Cost;
}

export function DisplayCost({ cost }: Props) {
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
        , if you purchase online ({percent_discount(cost)}% online discount).
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
      })}
      <hr />
      <Icon name="money-check" /> Cost: {desc}
    </span>
  );
}
