/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import * as misc from "@cocalc/util/misc";
import { useInterval } from "react-interval-hook";

interface Props {
  start_ts: number;
  interval_s?: number;
}

function isSame(prev, next) {
  if (prev == null || next == null) return false;
  return prev.start_ts != next.start_ts;
}

export const TimeElapsed: React.FC<Props> = React.memo((props: Props) => {
  const { start_ts, interval_s = 1 } = props;

  const [elapsed, setElapsed] = React.useState("");

  useInterval(() => {
    if (start_ts == null) return;
    const delta_s = (misc.server_time().getTime() - start_ts) / 1000;
    const uptime_str = misc.seconds2hms(delta_s, true);
    setElapsed(uptime_str);
  }, interval_s * 1000);

  if (start_ts == null) return null;

  return <React.Fragment>{elapsed}</React.Fragment>;
}, isSame);
