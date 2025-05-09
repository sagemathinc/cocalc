/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { useInterval } from "react-interval-hook";

import { seconds2hms, server_time } from "@cocalc/util/misc";

interface Props {
  start_ts: number;
  interval_s?: number;
}

export function TimeElapsed({ start_ts, interval_s = 1 }: Props) {
  const [elapsed, setElapsed] = React.useState<string>(getUptimeStr());

  function getUptimeStr() {
    if (start_ts == null) return "";
    const delta_s = (server_time().getTime() - start_ts) / 1000;
    const uptime_str = seconds2hms(delta_s, true);
    return uptime_str;
  }

  useInterval(() => {
    const next = getUptimeStr();
    if (!next) return;
    setElapsed(next);
  }, interval_s * 1000);

  if (start_ts == null) return null;

  return <React.Fragment>{elapsed}</React.Fragment>;
}
