import Cell from "./cell";

interface Props {
  cellList: string[];
  cells: { [id: string]: object };
  cmOptions: { [field: string]: any };
  fontSize?: number;
  project_id?: string;
  directory?: string;
}

export default function CellList({
  cellList,
  cells,
  fontSize,
  cmOptions,
  project_id,
  directory,
}: Props) {
  const v: JSX.Element[] = [];
  for (const id of cellList) {
    if (cells[id] == null) continue;
    v.push(
      <Cell
        key={id}
        cell={cells[id]}
        cmOptions={cmOptions}
        project_id={project_id}
        directory={directory}
      />
    );
  }
  return <div style={{ fontSize }}>{v}</div>;
}

