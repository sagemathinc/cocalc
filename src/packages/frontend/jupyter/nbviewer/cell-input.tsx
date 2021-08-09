import React from "react";
import { CodeMirrorStatic } from "../codemirror-static";
import Markdown from "@cocalc/frontend/markdown/component";

interface Props {
  cell: object;
  cmOptions: { [field: string]: any };
  project_id?: string;
  directory?: string;
}

export default function CellInput({ cell, cmOptions }: Props) {
  const value = cell["input"] ?? "";
  if (cell["cell_type"] == "markdown") {
    return <Markdown value={value} />;
  }
  return <CodeMirrorStatic value={value} options={cmOptions} />;
}
