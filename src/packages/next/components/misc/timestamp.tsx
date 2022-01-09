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

export default function Timestamp({
  epoch,
  datetime,
  style,
  absolute,
  dateOnly,
}: Props) {
  if (epoch && datetime == null) {
    datetime = new Date(epoch);
  }
  if (!datetime) {
    return <span style={style}>-</span>;
  }
  if (typeof datetime == "string") {
    datetime = new Date(datetime);
    if (typeof datetime == "string") throw Error("bug");
  }
  const absoluteTime = dateOnly
    ? datetime.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : datetime.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      });
  if (absolute) {
    return <span style={style}>{absoluteTime}</span>;
  }
  return (
    <Tooltip trigger={["hover", "click"]} title={absoluteTime}>
      <TimeAgo style={style} datetime={datetime} />
    </Tooltip>
  );
}
