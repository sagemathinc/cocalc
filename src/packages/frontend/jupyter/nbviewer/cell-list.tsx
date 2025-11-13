import { useState } from "react";
import { CSS } from "@cocalc/frontend/app-framework";
import Cell from "./cell";

interface Props {
  cellList: string[];
  cells: { [id: string]: object };
  cmOptions: { [field: string]: any };
  fontSize?: number;
  project_id?: string;
  directory?: string;
  kernel: string;
  style?: CSS;
}

export default function CellList({
  cellList,
  cells,
  fontSize,
  cmOptions,
  project_id,
  directory,
  kernel,
  style,
}: Props) {
  // modifications to inputs of cells (used for temporary editing)
  const [edits, setEdits] = useState<{ [id: string]: string } | null>(null);

  const v: React.JSX.Element[] = [];
  let history: string[] = [];
  for (const id of cellList) {
    const cell = cells[id];
    if (cell == null) continue;
    v.push(
      <Cell
        key={id}
        kernel={kernel}
        cell={cell}
        edits={edits}
        setEdits={setEdits}
        cmOptions={cmOptions}
        project_id={project_id}
        directory={directory}
        history={history}
      />,
    );
    if (cell["cell_type"] == "code") {
      const input = edits?.[id]?.trim() ?? cell["input"]?.trim();
      if (input) {
        history = history.concat(input);
      }
    }
  }
  return <div style={{ fontSize, ...style }}>{v}</div>;
}
