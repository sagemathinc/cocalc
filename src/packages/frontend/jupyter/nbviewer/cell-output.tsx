import React from "react";
import { fromJS } from "immutable";

interface Props {
  cell: object;
  cmOptions: { [field: string]: any };
  project_id?: string;
  directory?: string;
}

export default function CellOutput({
  cell,
  cmOptions,
  project_id,
  directory,
}: Props) {
  const output = cell["output"];
  console.log({ output });
  if (output == null) return null;
  const v: number[] = [];
  for (const n in output) {
    v.push(parseInt(n));
  }
  v.sort((a, b) => a - b);
  const w: JSX.Element[] = [];
  for (const n in v) {
    w.push(<pre>{JSON.stringify(output[n], undefined, 2)}</pre>);
  }
  return <div>{w}</div>;
}
