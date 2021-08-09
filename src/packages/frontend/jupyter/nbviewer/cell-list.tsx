import React from "react";

interface Props {
  cellList: string[];
  cells: { [id: string]: object };
  cmOptions: { [field: string]: any };
  fontSize: number;
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
  return (
    <pre>
      {JSON.stringify({
        cellList,
        cells,
        fontSize,
        cmOptions,
        project_id,
        directory,
      })}
    </pre>
  );
}
