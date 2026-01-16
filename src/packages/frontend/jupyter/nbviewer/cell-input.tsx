/*
Show the input part of a cell.
*/

import { CodeMirrorStatic } from "../codemirror-static";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { InputPrompt } from "../prompt/input-nbviewer";
import ActionButtons from "@cocalc/frontend/editors/slate/elements/code-block/action-buttons";
import { useRef, useState } from "react";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import CodeEditor from "@cocalc/frontend/components/code-editor";

interface Props {
  cell: object;
  cmOptions: { [field: string]: any };
  project_id?: string;
  directory?: string;
  kernel: string;
  output;
  setOutput;
  history: string[];
  edits: { [id: string]: string } | null;
  setEdits: (edits: { [id: string]: string } | null) => void;
}

export default function CellInput({
  cell,
  cmOptions,
  kernel,
  output,
  setOutput,
  history,
  edits,
  setEdits,
}: Props) {
  const value = edits?.[cell["id"] ?? ""] ?? cell["input"] ?? "";
  const [editing, setEditing] = useState<boolean>(false);
  const [newValue, setNewValue] = useState<string>(value);
  const { disableExtraButtons } = useFileContext();
  const runRef = useRef<any>(null);

  const save = (run) => {
    setEdits({ ...edits, [cell["id"] ?? ""]: newValue });
    setEditing(false);
    if (!run) return;
    // have to wait since above causes re-render
    setTimeout(() => {
      runRef.current?.();
    }, 1);
  };

  const controlBar = disableExtraButtons ? null : (
    <div
      style={{
        borderBottom: "1px solid #ccc",
        padding: "3px",
        display: "flex",
        background: "#f8f8f8",
      }}
    >
      <div style={{ flex: 1 }} />
      <ActionButtons
        size="small"
        input={newValue}
        output={output}
        setOutput={setOutput}
        info={`${cmOptions.mode?.name} {kernel='${kernel}'}`}
        history={history}
        runRef={runRef}
      />
    </div>
  );

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
        <div style={{ overflow: "hidden", flex: 1 }}>
          {editing && (
            <div
              style={{
                border: "1px solid #ccc",
                borderRadius: "5px",
                overflow: "hidden",
              }}
            >
              {controlBar}
              <CodeEditor
                autoFocus
                language={cmOptions.mode?.name}
                value={value}
                style={{
                  fontSize: "14.6666px",
                  fontFamily: "monospace",
                  lineHeight: "normal",
                  border: "0px solid white",
                }}
                onChange={(event) => setNewValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.shiftKey && event.keyCode === 13) {
                    save(true);
                    event.stopPropagation();
                  }
                }}
              />
            </div>
          )}
          {!editing && (
            <CodeMirrorStatic
              style={{ padding: "10px" }}
              value={value}
              options={cmOptions}
              addonBefore={controlBar}
              onDoubleClick={() => setEditing(true)}
            />
          )}
          {output}
        </div>
      )}
    </div>
  );
}
