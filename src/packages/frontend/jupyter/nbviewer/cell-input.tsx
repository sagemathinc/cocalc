/*
Show the input part of a cell.

TODO: To make this editable I just used a quick Input component from antd,
which sucks compared to what codemirror provides.  But it's only temporary.
Codemirror is harder due to compat with nextjs and we'll do that later.
*/

import { CodeMirrorStatic } from "../codemirror-static";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { InputPrompt } from "../prompt/input-nbviewer";
import ActionButtons from "@cocalc/frontend/editors/slate/elements/code-block/action-buttons";
import { Button, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { ElementType, useEffect, useRef, useState } from "react";
import { useFileContext } from "@cocalc/frontend/lib/file-context";

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
  const { jupyterApiEnabled } = useFileContext();
  const runRef = useRef<any>(null);
  const [Editor, setEditor] = useState<ElementType | null>(null);

  // We lazy load the Editor because we want to support using this in nextjs.
  useEffect(() => {
    if (editing && Editor == null) {
      (async () => {
        setEditor((await import("@uiw/react-textarea-code-editor")).default);
      })();
    }
  }, [editing]);

  const save = (run) => {
    setEdits({ ...edits, [cell["id"] ?? ""]: newValue });
    setEditing(false);
    if (!run) return;
    // have to wait since above causes re-render
    setTimeout(() => {
      runRef.current?.();
    }, 1);
  };

  const controlBar = (
    <div
      style={{
        borderBottom: "1px solid #ccc",
        padding: "3px",
        display: "flex",
        background: "#f8f8f8",
      }}
    >
      <div style={{ flex: 1 }} />
      {jupyterApiEnabled && (
        <Tooltip
          placement="bottom"
          title={
            editing
              ? "Temporarily save yours changes so they are available to rest of this notebook.  Use shift+enter to save and run."
              : "Temporarily edit this code (shortcut: double click the code)."
          }
        >
          <Button
            type={editing && newValue != value ? undefined : "text"}
            style={
              editing && newValue != value
                ? { background: "#5cb85c", color: "white" }
                : { color: "#666" }
            }
            onClick={() => {
              if (editing) {
                save(false);
              } else {
                setEditing(!editing);
              }
            }}
          >
            <Icon name={editing ? "save" : "pencil"} />{" "}
            {editing ? "Save" : "Edit"}
          </Button>
        </Tooltip>
      )}
      <ActionButtons
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
              {Editor && (
                <Editor
                  autoFocus
                  language={cmOptions.mode?.name}
                  value={value}
                  style={{
                    fontSize: "14.6666px",
                    fontFamily: "monospace",
                    lineHeight: "normal",
                    border: "0px solid white",
                  }}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.shiftKey && event.keyCode === 13) {
                      save(true);
                    }
                  }}
                />
              )}
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
