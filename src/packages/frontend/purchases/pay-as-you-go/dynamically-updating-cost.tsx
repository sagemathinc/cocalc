/*
A dynamically updating cost, which is useful for pay as you go.
*/

import { Tooltip } from "antd";
import { useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency } from "@cocalc/util/misc";
import { useInterval } from "react-interval-hook";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";

const MS_IN_HOUR = 1000 * 60 * 60;

interface Props {
  costPerHour: number; // cost per hour in USD
  start?: number; // start time in ms since epoch
}

export default function DynamicallyUpdatingCost({ costPerHour, start }: Props) {
  const [currentTime, setCurrentTime] = useState(
    webapp_client.server_time().valueOf()
  );

  useInterval(() => {
    setCurrentTime(webapp_client.server_time().valueOf());
  }, 60000);

  if (!start) {
    return null;
  }

  const cost = (costPerHour * (currentTime - start)) / MS_IN_HOUR;
  return (
    <Tooltip
      title={
        <>
          {currency(costPerHour)}/hour since <TimeAgo date={start} />
        </>
      }
    >
      {currency(cost)}
    </Tooltip>
  );
}
