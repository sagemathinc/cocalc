import React from "react";
import { fromJS } from "immutable";
import { CellOutputMessages } from "../output-messages/message";

interface Props {
  cell: object;
  project_id?: string;
  directory?: string;
}

export default function CellOutput({ cell, project_id, directory }: Props) {
  const output = cell["output"];
  if (output == null) return null;

  return (
    <CellOutputMessages
      output={fromJS(output)}
      directory={directory}
      project_id={project_id}
    />
  );
}
