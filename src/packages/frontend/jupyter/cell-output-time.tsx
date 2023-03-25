/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { TimeAgo } from "../components";
import { Tooltip } from "antd";

interface CellTimingProps {
  start?: number;
  end?: number;
}

export default function CellTiming({ start, end }: CellTimingProps) {
  if (start == null) {
    return null;
  }
  if (end != null) {
    const seconds = (end - start) / 1000;
    return (
      <Tooltip
        title={`This cell took ${seconds} seconds total wall time to run.`}
      >
        <span>{seconds} seconds</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip title={"When code started running"}>
      <TimeAgo date={new Date(start)} />
    </Tooltip>
  );
}
