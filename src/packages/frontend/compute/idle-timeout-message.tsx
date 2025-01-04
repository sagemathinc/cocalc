import { useState } from "react";
import { useServer } from "./compute-server";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);
import { Tooltip } from "antd";
import { useInterval } from "react-interval-hook";

interface Props {
  id: number;
  project_id: string;
  style?;
  minimal?: boolean;
}

export default function IdleTimeoutMessage({
  id,
  project_id,
  style,
  minimal,
}: Props) {
  const server = useServer({ id, project_id });
  const [counter, setCounter] = useState<number>(0);
  useInterval(() => {
    setCounter(counter + 1);
  }, 5000);

  if (!server) {
    return null;
  }
  const { state, last_edited_user, idle_timeout } = server;
  if (!idle_timeout || state != "running" || !last_edited_user) {
    return null;
  }
  const last = dayjs(last_edited_user);
  const date = last.add(idle_timeout, "minutes");
  const mesg = (
    <>
      Server will stop <TimeAgo date={date.toDate()} /> unlesss somebody
      actively edits.
    </>
  );
  if (!minimal) {
    return <div style={style}>{mesg}</div>;
  }

  let d = date.diff(dayjs());
  const formattedDiff = dayjs.duration(d).format("HH:mm:ss");
  return (
    <Tooltip title={<>Idle Timeout: {mesg}</>}>
      <div style={style}>{formattedDiff}</div>
    </Tooltip>
  );
}
