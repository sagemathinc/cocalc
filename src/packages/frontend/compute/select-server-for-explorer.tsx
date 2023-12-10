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
}

export default function SelectComputeServerForFileExplorer({
  project_id,
  style,
  size,
}: Props) {
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");

  return (
    <SelectServer
      size={size}
      project_id={project_id}
      style={style}
      value={compute_server_id}
      setValue={(compute_server_id) => {
        const actions = redux.getProjectActions(project_id);
        actions.setComputeServerId(compute_server_id ?? 0);
      }}
    />
  );
}
