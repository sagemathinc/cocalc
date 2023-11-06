import type { ComputeServerEvent } from "@cocalc/util/compute/log";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { capitalize, plural } from "@cocalc/util/misc";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Icon } from "@cocalc/frontend/components";

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
  switch (event.action) {
    case "error":
      return (
        <>
          {cs} <Error error={event.error} />
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
            <Icon name={icon} /> {capitalize(event.state)}
          </span>{" "}
          {cs}
        </>
      );
    case "configuration":
      return (
        <>
          {cs} Configuration{" "}
          {plural(Object.keys(event.changes).length, "change")} -{" "}
          {changeString(event.changes)}
        </>
      );
    default:
      return (
        <>
          {cs} {JSON.stringify(event)}
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

export function Error({ error }) {
  return (
    <div
      style={{
        border: "0px 5px",
        display: "inline-block",
        color: "white",
        background: "darkred",
        padding: "1px 5px",
        borderRadius: "3px",
      }}
    >
      {error}
    </div>
  );
}
