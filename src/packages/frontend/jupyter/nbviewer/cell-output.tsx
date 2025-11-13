import { fromJS } from "immutable";
import { CellOutput } from "../cell-output";

interface Props {
  cell?: object;
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
  if (cell == null) {
    return null;
  }
  return (
    <CellOutput
      id={cell["id"]}
      cell={fromJS(cell)}
      project_id={project_id}
      directory={directory}
      more_output={more_output}
      hidePrompt={hidePrompt}
    />
  );
}
