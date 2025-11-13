import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, isIconName } from "@cocalc/frontend/components";
import ComputeServerTag from "@cocalc/frontend/compute/server-tag";
import type { ComputeServerEvent } from "@cocalc/util/compute/log";
import {
  STATE_INFO,
  spendLimitPeriod,
} from "@cocalc/util/db-schema/compute-servers";
import { capitalize, currency, plural } from "@cocalc/util/misc";

export default function LogEntry({
  project_id,
  event,
  hideTitle,
}: {
  project_id: string;
  event: ComputeServerEvent;
  hideTitle?: boolean;
}) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const title = computeServers?.getIn([`${event.server_id}`, "title"]);
  if (title == null) {
    return null;
  }
  const cs = hideTitle ? <></> : <>Compute Server "{title}" - </>;
  const tag = (
    <ComputeServerTag
      id={event.server_id}
      style={{ float: "right", maxWidth: "125px" }}
    />
  );

  switch (event.action) {
    case "error":
      return (
        <>
          {cs} <Error error={event.error} />
          {tag}
        </>
      );
    case "state":
      if (!STATE_INFO[event.state]) {
        return null;
      }
      const { color, icon } = STATE_INFO[event.state];
      return (
        <>
          <span style={{ color }}>
            {isIconName(icon) && <Icon name={icon} />} {capitalize(event.state)}
          </span>{" "}
          {cs}
          {tag}
        </>
      );
    case "configuration":
      return (
        <>
          {cs} Configuration{" "}
          {plural(Object.keys(event.changes).length, "change")} -{" "}
          {changeString(event.changes)}
          {tag}
        </>
      );
    case "automatic-shutdown":
      // DEPRECATED: for backward compatibility only...
      return (
        <>
          {cs} - Automatic{" "}
          {capitalize(event.automatic_shutdown?.action ?? "Stop")} {tag}
        </>
      );

    case "health-check-failure":
      return (
        <>
          {cs} - Health check failure{" "}
          {capitalize(event.healthCheck?.action ?? "Stop")} {tag}
        </>
      );

    case "idle-timeout":
      return (
        <>
          {cs} - Idle Timeout Shutdown (inactive for at least{" "}
          {event.idle_timeout} {plural(event.idle_timeout, "minute")}) {tag}
        </>
      );

    case "shutdown-time":
      return (
        <>
          {cs} - Schedule Shutdown -- shutting down due to a prescheduled daily
          shutdown time {tag}
        </>
      );
    case "spend-limit":
      return (
        <>
          {cs} - Spend Limit Shutdown (total spend during the last{" "}
          {spendLimitPeriod(event.spendLimit?.hours)} hit{" "}
          {currency(event.total)} which exceeded limit of{" "}
          {currency(event.spendLimit?.dollars)}) {tag}
        </>
      );
    default:
      return (
        <>
          {cs} {JSON.stringify(event)}
          {tag}
        </>
      );
  }
}

function changeString(changes) {
  let v: string[] = [];
  for (const key in changes) {
    const { from, to } = changes[key];
    v.push(`${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  }
  if (v.length == 0) {
    return "(no change)";
  }
  return v.join("; ");
}

export function Error({ error, style }: { error; style? }) {
  return (
    <div
      style={{
        border: "0px 5px",
        display: "inline-block",
        color: "white",
        background: "darkred",
        padding: "1px 5px",
        borderRadius: "3px",
        ...style,
      }}
    >
      {error}
    </div>
  );
}
