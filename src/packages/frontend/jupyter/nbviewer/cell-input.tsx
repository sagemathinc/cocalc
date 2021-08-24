import React from "react";
import { CodeMirrorStatic } from "../codemirror-static";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { InputPrompt } from "../prompt/input-nbviewer";

interface Props {
  cell: object;
  cmOptions: { [field: string]: any };
  project_id?: string;
  directory?: string;
}

export default function CellInput({ cell, cmOptions }: Props) {
  const value = cell["input"] ?? "";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      <InputPrompt exec_count={cell["exec_count"]} type={cell["cell_type"]} />
      {cell["cell_type"] == "markdown" ? (
        <Markdown value={value} />
      ) : (
        <CodeMirrorStatic value={value} options={cmOptions} />
      )}
    </div>
  );
}
