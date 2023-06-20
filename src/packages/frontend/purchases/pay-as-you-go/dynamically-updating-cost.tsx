/*
A dynamically updating cost, which is useful for pay as you go.
*/

import { useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency } from "../quota-config";
import { useInterval } from "react-interval-hook";

const MS_IN_HOUR = 1000 * 60 * 60;

interface Props {
  costPerHour: number; // cost per hour in USD
  start: number; // start time in ms since epoch
}

export default function DynamicallyUpdatingCost({ costPerHour, start }: Props) {
  const [currentTime, setCurrentTime] = useState(
    webapp_client.server_time().valueOf()
  );

  useInterval(() => {
    setCurrentTime(webapp_client.server_time().valueOf());
  }, 60000);

  const cost = (costPerHour * (currentTime - start)) / MS_IN_HOUR;
  return <>{currency(cost)}</>;
}
