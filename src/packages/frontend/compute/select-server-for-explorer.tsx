/*
Dropdown for selecting compute server for the file explorer
*/

import type { CSSProperties } from "react";
import { useState } from "react";
import SelectServer from "./select-server";

interface Props {
  project_id: string;
  style?: CSSProperties;
}

export default function SelectComputeServerForFileExplorer({
  project_id,
  style,
}: Props) {
  const [value, setValue] = useState<number | undefined>(undefined);

  return (
    <SelectServer
      project_id={project_id}
      style={style}
      value={value}
      setValue={setValue}
    />
  );
}
