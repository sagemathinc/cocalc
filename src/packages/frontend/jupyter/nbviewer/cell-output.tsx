import React from "react";
import { fromJS } from "immutable";
import { CellOutput } from "../cell-output";

interface Props {
  cell: object;
  project_id?: string;
  directory?: string;
}

export default function NBViewerCellOutput({
  cell,
  project_id,
  directory,
}: Props) {
  const output = cell["output"];
  if (output == null) return null;
  const actions: any = {
    toggle_output: (id: string, state: "collapsed" | "scrolled") => {
      console.log(id, state);
    },
  };
  return (
    <CellOutput
      id={cell["id"]}
      cell={fromJS(cell)}
      actions={actions}
      project_id={project_id}
      directory={directory}
    />
  );
}
