/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Progress, Space, Tooltip } from "antd";
import { TimeAgo, Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { capitalize, seconds2hms, server_time } from "@cocalc/util/misc";
import { useEffect } from "react";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";

interface CellTimingProps {
  start?: number;
  end?: number;
  last?: number;
  state?;
  isLive?: boolean;
  kernel?: string;
}

// make this small so smooth.
const DELAY_MS = 100;

function humanReadableSeconds(s) {
  if (s >= 0.9) {
    return seconds2hms(s, true);
  } else {
    return `${Math.round(s * 1000)} ms`;
  }
}

export default function CellTiming({
  start,
  end,
  last,
  state,
  isLive,
  kernel,
}: CellTimingProps) {
  const isMountedRef = useIsMountedRef();
  const { inc } = useCounter();

  useEffect(() => {
    const active =
      isLive &&
      isMountedRef.current &&
      start != null &&
      end == null &&
      state == "busy";
    if (!active) {
      return;
    }
    setTimeout(inc, DELAY_MS);
  }, [start, end, state, inc]);

  if (start != null && end != null) {
    const ms = end - start;
    return (
      <Tooltip
        title={
          <>
            Took about {humanReadableSeconds(ms / 1000)}. Evaluated{" "}
            <TimeAgo date={new Date(start)} />
            {kernel ? " using " : ""}
            {capitalize(kernel)}.
            {last != null ? (
              <> Previous run took {humanReadableSeconds(last / 1000)}.</>
            ) : undefined}
          </>
        }
      >
        <span style={{ cursor: "pointer" }}>{seconds2hms(ms / 1000)}</span>
      </Tooltip>
    );
  } else if (isLive && start == null && end == null && state == "run") {
    // it's waiting to run
    return (
      <Tooltip title="Waiting for another cell to finish running.">
        <span>
          <Icon
            name="hand"
            style={{
              color: "#ff4d4f",
              marginRight: "5px",
            }}
          />{" "}
          Pending
        </span>
      </Tooltip>
    );
  } else if (isLive && start != null && end == null && state == "busy") {
    const ms = server_time().getTime() - start;
    return (
      <Tooltip
        title={
          <>
            Started running <TimeAgo date={new Date(start)} /> and has not
            finished yet.{" "}
            {last != null ? (
              <>Previous run took {seconds2hms(last / 1000, true)}.</>
            ) : undefined}
          </>
        }
      >
        <Space style={{ cursor: "pointer", marginTop: "-2.5px" }}>
          {(last ?? 0) > 0 && (
            <Progress
              percent={(100 * ms) / (last ?? 0)}
              showInfo={false}
              style={{ width: "100px" }}
              strokeColor="green"
            />
          )}
          <div
            style={{ minWidth: "50px" /* to avoid jiggle when time small */ }}
          >
            <Icon
              name="plus-circle-filled"
              style={{
                color: COLORS.GRAY_M,
                animation: "loadingCircle 3s infinite linear",
                marginRight: "5px",
              }}
            />
            {seconds2hms(ms / 1000)}
          </div>
        </Space>
      </Tooltip>
    );
  } else {
    return null;
  }
}
