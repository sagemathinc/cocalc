import React from "react";
import CellInput from "./cell-input";
import CellOutput from "./cell-output";

interface Props {
  cell: object;
  cmOptions: { [field: string]: any };
  project_id?: string;
  directory?: string;
}

export default function Cell({
  cell,
  cmOptions,
  project_id,
  directory,
}: Props) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <CellInput cell={cell} cmOptions={cmOptions} />
      <CellOutput cell={cell} project_id={project_id} directory={directory} />
    </div>
  );
}
