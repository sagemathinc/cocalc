import Cell from "./cell";

interface Props {
  cellList: string[];
  cells: { [id: string]: object };
  cmOptions: { [field: string]: any };
  fontSize?: number;
  project_id?: string;
  directory?: string;
  kernel: string;
}

export default function CellList({
  cellList,
  cells,
  fontSize,
  cmOptions,
  project_id,
  directory,
  kernel,
}: Props) {
  const v: JSX.Element[] = [];
  let history: string[] = [];
  for (const id of cellList) {
    const cell = cells[id];
    if (cell == null) continue;
    v.push(
      <Cell
        key={id}
        kernel={kernel}
        cell={cell}
        cmOptions={cmOptions}
        project_id={project_id}
        directory={directory}
        history={history}
      />
    );
    if (cell["cell_type"] == "code") {
      const input = cell["input"]?.trim();
      if (input) {
        history = history.concat(input);
      }
    }
  }
  return <div style={{ fontSize }}>{v}</div>;
}
