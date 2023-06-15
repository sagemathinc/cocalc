import { useEffect, useState } from "react";
import { fromJS, Map } from "immutable";
import { CellOutput } from "../cell-output";

interface Props {
  cell: object;
  project_id?: string;
  directory?: string;
  more_output?;
  hidePrompt?: boolean;
}

export default function NBViewerCellOutput({
  cell,
  project_id,
  directory,
  more_output,
  hidePrompt,
}: Props) {
  const [iCell, setICell] = useState<Map<string, any> | null>(
    cell == null ? null : fromJS(cell)
  );

  useEffect(() => {
    setICell(fromJS(cell));
  }, [cell]);

  const actions: any = {
    toggle_output: (_id: string, state: "collapsed" | "scrolled") => {
      if (iCell == null) return;
      setICell(iCell.set(state, !iCell.get(state)));
    },
  };

  if (iCell == null) {
    return null;
  }
  return (
    <CellOutput
      id={cell["id"]}
      cell={iCell}
      actions={actions}
      project_id={project_id}
      directory={directory}
      more_output={more_output}
      hidePrompt={hidePrompt}
    />
  );
}
