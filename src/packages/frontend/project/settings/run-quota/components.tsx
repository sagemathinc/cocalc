/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CheckCircleTwoTone, CloseCircleTwoTone } from "@ant-design/icons";
import { React, useEffect, useState } from "@cocalc/frontend/app-framework";
import { server_time } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Progress } from "antd";
import { useInterval } from "react-interval-hook";

export const PercentBar: React.FC<{
  percent?: number;
  percent2?: number; // part of the main bar, should be < percent
  format?: (pct?: number) => React.ReactNode;
}> = ({ percent, percent2, format }) => {
  if (percent == null) return null;

  function props() {
    if (typeof percent2 === "number") {
      return { success: { percent: percent2, strokeColor: COLORS.GRAY_D } };
    }
  }

  return (
    <Progress
      percent={percent}
      strokeColor={COLORS.GRAY_L}
      size={"small"}
      format={format}
      status={"normal"}
      {...props()}
    />
  );
};

// This shows the used idle timeout in percent. It also updates at a low frequency.
export const IdleTimeoutPct: React.FC<{
  idle_timeout: number;
  last_edited: Date;
}> = ({ idle_timeout, last_edited }) => {
  const [pct, setPct] = useState<number | null>(null);

  function update() {
    const used = Math.max(0, server_time().valueOf() - last_edited.valueOf());
    const pct = Math.ceil(100 * Math.min(1, used / (1000 * idle_timeout)));
    setPct(pct);
  }

  useEffect(() => {
    update();
  }, [last_edited]);

  useInterval(() => {
    update();
  }, 1000 * 30);

  if (pct == null) {
    return null;
  } else {
    return <PercentBar percent={pct} />;
  }
};

export function renderBoolean(val) {
  if (val) {
    return <CheckCircleTwoTone twoToneColor={COLORS.ANTD_GREEN} />;
  } else {
    return <CloseCircleTwoTone twoToneColor={COLORS.ANTD_RED} />;
  }
}
