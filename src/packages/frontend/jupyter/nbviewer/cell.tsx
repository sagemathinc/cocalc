import { ReactNode, useState } from "react";

import CellInput from "./cell-input";
import CellOutput from "./cell-output";

interface Props {
  cell: object;
  cmOptions: { [field: string]: any };
  project_id?: string;
  directory?: string;
  kernel: string;
}

export default function Cell({
  cell,
  cmOptions,
  project_id,
  directory,
  kernel,
}: Props) {
  const [output, setOutput] = useState<null | ReactNode>(null);
  return (
    <div style={{ marginBottom: "10px" }}>
      <CellInput
        cell={cell}
        cmOptions={cmOptions}
        kernel={kernel}
        output={output}
        setOutput={setOutput}
      />
      {output == null && (
        <CellOutput cell={cell} project_id={project_id} directory={directory} />
      )}
    </div>
  );
}
