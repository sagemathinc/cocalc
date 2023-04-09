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
import { Button, Input, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRef, useState } from "react";
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
              ? "Save temporary changes.  Use shift+enter to run."
              : "Temporarily edit this code."
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
              <Input.TextArea
                autoFocus
                style={{
                  fontFamily: "monospace",
                  fontSize: "14.6666px",
                  lineHeight: "normal",
                  border: "0px solid white",
                }}
                defaultValue={value}
                autoSize={true}
                onChange={(e) => setNewValue(e.target.value)}
                onPressEnter={(e) => {
                  if (e.shiftKey) {
                    save(true);
                  }
                }}
              />
            </div>
          )}
          {!editing && (
            <CodeMirrorStatic
              style={{ padding: "4px 11px" }}
              value={value}
              options={cmOptions}
              addonBefore={controlBar}
            />
          )}
          {output}
        </div>
      )}
    </div>
  );
}
