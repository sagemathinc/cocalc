/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import { CSSProperties } from "react";
import TimeAgo from "timeago-react";

interface Props {
  epoch?: number; // ms since epoch
  datetime?: Date | string;
  style?: CSSProperties;
  dateOnly?: boolean;
  absolute?: boolean;
}

export function processTimestamp(props: Props) {
  const { epoch, dateOnly } = props;
  let datetime = props.datetime;

  if (epoch && datetime == null) {
    datetime = new Date(epoch);
  }

  if (!datetime) {
    return "-";
  }

  if (typeof datetime == "string") {
    datetime = new Date(datetime);
    if (typeof datetime == "string") throw Error("bug");
  }

  const absoluteTimeDateOnly = datetime.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const absoluteTimeFull = datetime.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  const timeShown = dateOnly ? absoluteTimeDateOnly : absoluteTimeFull;

  return { datetime, timeShown, absoluteTimeDateOnly, absoluteTimeFull };
}

export default function Timestamp(props: Props) {
  const { style, absolute } = props;
  const data = processTimestamp(props);
  if (data === "-") {
    return <span style={style}>-</span>;
  }
  const { datetime, timeShown, absoluteTimeFull } = data;

  if (absolute) {
    return (
      <Tooltip trigger={["hover", "click"]} title={absoluteTimeFull}>
        <span style={style}>{timeShown}</span>
      </Tooltip>
    );
  }

  return (
    <Tooltip trigger={["hover", "click"]} title={timeShown}>
      <TimeAgo style={style} datetime={datetime} />
    </Tooltip>
  );
}
