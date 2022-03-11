/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useState } from "@cocalc/frontend/app-framework";
import { server_time } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Progress, Typography } from "antd";
import { useInterval } from "react-interval-hook";

export const PercentBar: React.FC<{
  percent?: number;
  format?: (pct?: number) => React.ReactNode;
}> = ({ percent, format }) => {
  if (percent == null) return null;
  return (
    <Progress
      percent={percent}
      status={"normal"}
      strokeColor={COLORS.GRAY_L}
      size={"small"}
      format={format}
    />
  );
};

// This shows the used idle timeout in percent. It also updates at a low frequency.
export const IdleTimeoutPct: React.FC<{
  idle_timeout: number;
  last_edited: Date;
}> = ({ idle_timeout, last_edited }) => {
  const [pct, setPct] = useState<number>(calc());

  function calc() {
    const used = Math.max(0, server_time().valueOf() - last_edited.valueOf());
    const pct = Math.ceil(100 * Math.min(1, used / (1000 * idle_timeout)));
    return pct;
  }

  useInterval(() => {
    setPct(calc());
  }, 1000 * 30);

  return <PercentBar percent={pct} />;
};
