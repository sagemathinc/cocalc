import type { ComputeServerEvent } from "@cocalc/util/compute/log";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { capitalize } from "@cocalc/util/misc";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Icon } from "@cocalc/frontend/components";

export default function LogEntry({
  project_id,
  event,
}: {
  project_id: string;
  event: ComputeServerEvent;
}) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const title = computeServers?.getIn([`${event.server_id}`, "title"]);
  if (title == null) {
    return null;
  }
  const cs = <>Compute Server "{title}" -- </>;
  switch (event.action) {
    case "error":
      return (
        <>
          {cs}{" "}
          <div
            style={{
              border: "0px 5px",
              display: "inline-block",
              color: "white",
              background: "darkred",
            }}
          >
            Error: {event.error}
          </div>
        </>
      );
    case "state":
      if (!STATE_INFO[event.state]) {
        return null;
      }
      const { color, icon } = STATE_INFO[event.state];
      return (
        <>
          {cs} <span style={{ color }}><Icon name={icon}/> {capitalize(event.state)}</span>
        </>
      );
    case "configuration":
      return (
        <>
          {cs} Configuration change: {JSON.stringify(event.changes)}
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
