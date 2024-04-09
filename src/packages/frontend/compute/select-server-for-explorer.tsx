/*
Dropdown for selecting compute server for the file explorer
*/

import type { CSSProperties } from "react";
import SelectServer from "./select-server";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";

interface Props {
  project_id: string;
  style?: CSSProperties;
  size?;
  noLabel?: boolean;
}

export default function SelectComputeServerForFileExplorer({
  project_id,
  style,
  size,
  noLabel,
}: Props) {
  const compute_servers_enabled = useTypedRedux(
    "customize",
    "compute_servers_enabled",
  );
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");
  if (!compute_servers_enabled) {
    return null;
  }

  return (
    <SelectServer
      title={`Showing files ${
        compute_server_id
          ? `on compute server ${compute_server_id}`
          : "in the project"
      }.  When you create or open a file, it will by default open ${
        compute_server_id
          ? `on compute server ${compute_server_id}`
          : "in the project"
      }.`}
      size={size}
      project_id={project_id}
      style={style}
      value={compute_server_id}
      noLabel={noLabel}
      setValue={(compute_server_id) => {
        const actions = redux.getProjectActions(project_id);
        actions.setComputeServerId(compute_server_id ?? 0);
      }}
    />
  );
}
