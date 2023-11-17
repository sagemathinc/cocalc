/*
A dynamically updating cost and rate components, which is useful for pay as you go.
For rate display, only the tooltip is dynamically updated.
*/

import { Tooltip } from "antd";
import { useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency, round3 } from "@cocalc/util/misc";
import { useInterval } from "react-interval-hook";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { getAmountStyle } from "@cocalc/util/db-schema/purchases";

const MS_IN_HOUR = 1000 * 60 * 60;
const UPDATE_INTERVAL_S = 10; // very cheap to update; confusing if too infrequent -- annoying if too frequent?

interface Props {
  costPerHour: number; // cost per hour in USD
  start?: number; // start time in ms since epoch
  alwaysNonnegative?: boolean; // for display to use in side panel, etc., this is less confusing.
  extraTip?;
}

export default function DynamicallyUpdatingCost(props: Props) {
  return <DynamicallyUpdating {...props} />;
}

export function DynamicallyUpdatingRate(props: Props) {
  return <DynamicallyUpdating rate {...props} />;
}

function DynamicallyUpdating({
  costPerHour,
  start,
  alwaysNonnegative,
  extraTip,
  rate,
}: Props & { rate?: boolean }) {
  const [currentTime, setCurrentTime] = useState(
    webapp_client.server_time().valueOf(),
  );

  useInterval(() => {
    setCurrentTime(webapp_client.server_time().valueOf());
  }, 1000 * UPDATE_INTERVAL_S);

  if (!start && !rate) {
    return null;
  }
  let body, cost;
  if (!start) {
    body = <span style={getAmountStyle(1)}>{currency(costPerHour, 2)}/h</span>;
    cost = null;
  } else {
    cost = (costPerHour * (currentTime - start)) / MS_IN_HOUR;
    let amount = -cost;
    if (alwaysNonnegative) {
      amount = Math.abs(amount);
    }
    body = rate ? (
      <span style={getAmountStyle(amount)}>{currency(costPerHour, 2)}/h</span>
    ) : (
      <span style={getAmountStyle(amount)}>{currency(amount, 2)}</span>
    );
  }
  return (
    <Tooltip
      title={
        <Tip
          costPerHour={costPerHour}
          start={start}
          cost={cost}
          extraTip={extraTip}
        />
      }
    >
      {body}
    </Tooltip>
  );
}

function Tip({ costPerHour, start, cost, extraTip }) {
  return (
    <>
      Costs {currency(costPerHour, 2)}/hour
      {cost && start && (
        <div>
          Accrued cost: ${round3(cost)} since <TimeAgo date={start} />
        </div>
      )}
      {extraTip && <div>{extraTip}</div>}
    </>
  );
}
