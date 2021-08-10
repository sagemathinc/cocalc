import React, { useState } from "react";
import { fromJS, Map } from "immutable";
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
  const [iCell, setICell] = useState<Map<string, any>>(fromJS(cell));

  const actions: any = {
    toggle_output: (_id: string, state: "collapsed" | "scrolled") => {
      setICell(iCell.set(state, !iCell.get(state)));
    },
  };

  return (
    <CellOutput
      id={cell["id"]}
      cell={iCell}
      actions={actions}
      project_id={project_id}
      directory={directory}
    />
  );
}
