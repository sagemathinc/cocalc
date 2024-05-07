/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { TimeAgo } from "@cocalc/frontend/components";

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
    const secondsDisp: string =
      seconds < 0.1 ? "<0.1s" : `${seconds.toFixed(1)}s`;
    return (
      <Tooltip
        title={
          <>
            This cell was evaluted <TimeAgo date={new Date(start)} /> and took{" "}
            {seconds} seconds total wall time to run.
          </>
        }
      >
        <span>{secondsDisp}</span>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={"When code started running"}>
      <TimeAgo date={new Date(start)} />
    </Tooltip>
  );
}
