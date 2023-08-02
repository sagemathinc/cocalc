/*
A dynamically updating cost, which is useful for pay as you go.
*/

import { Tooltip } from "antd";
import { useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency } from "@cocalc/util/misc";
import { useInterval } from "react-interval-hook";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { getAmountStyle } from "@cocalc/util/db-schema/purchases";

const MS_IN_HOUR = 1000 * 60 * 60;
const UPDATE_INTERVAL_S = 10; // very cheap to update; confusing if too infrequent -- annoying if too frequent?

interface Props {
  costPerHour: number; // cost per hour in USD
  start?: number; // start time in ms since epoch
  alwaysNonnegative?: boolean; // for display to use in side panel, etc., this is less confusing.
}

export default function DynamicallyUpdatingCost({
  costPerHour,
  start,
  alwaysNonnegative,
}: Props) {
  const [currentTime, setCurrentTime] = useState(
    webapp_client.server_time().valueOf()
  );

  useInterval(() => {
    setCurrentTime(webapp_client.server_time().valueOf());
  }, 1000 * UPDATE_INTERVAL_S);

  if (!start) {
    return null;
  }

  const cost = (costPerHour * (currentTime - start)) / MS_IN_HOUR;
  let amount = -cost;
  if (alwaysNonnegative) {
    amount = Math.abs(amount);
  }
  return (
    <Tooltip
      title={
        <>
          Costs {currency(costPerHour)}/hour since <TimeAgo date={start} />
        </>
      }
    >
      <span style={getAmountStyle(amount)}>{currency(amount)}</span>
    </Tooltip>
  );
}
