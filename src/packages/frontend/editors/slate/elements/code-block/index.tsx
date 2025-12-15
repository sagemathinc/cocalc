/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Popover, Tooltip } from "antd";
import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Element } from "slate";
import { register, SlateElement, RenderElementProps } from "../register";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "./info-to-mode";
import ActionButtons from "./action-buttons";
import { useChange } from "../../use-change";
import { getHistory } from "./history";
import { DARK_GREY_BORDER } from "../../util";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import { Icon } from "@cocalc/frontend/components/icon";
import { isEqual } from "lodash";
import Mermaid from "./mermaid";

export interface CodeBlock extends SlateElement {
  type: "code_block";
  isVoid: true;
  fence: boolean;
  value: string;
  info: string;
}

interface FloatingActionMenuProps {
  editing: boolean;
  canEdit: boolean;
  info: string;
  content: string;
  onSaveOrEdit: () => void;
  onDownload: () => void;
  renderActions: (size?: "small" | "middle" | "large") => ReactNode;
}

function FloatingActionMenu({
  editing,
  canEdit,
  info,
  content,
  onSaveOrEdit,
  onDownload,
  renderActions,
}: FloatingActionMenuProps) {
  const [open, setOpen] = useState(false);

  const actionContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {canEdit && (
        <Tooltip
          title={
            <>
              Make a <i>temporary</i> change to this code.{" "}
              <b>This is not saved permanently anywhere!</b>
            </>
          }
        >
          <Button
            size="small"
            type={editing ? undefined : "text"}
            style={
              editing
                ? { background: "#5cb85c", color: "white" }
                : { color: "#666", textAlign: "left" }
            }
            onClick={() => {
              onSaveOrEdit();
              setOpen(false);
            }}
          >
            <Icon name={"pencil"} /> {editing ? "Save" : "Edit"}
          </Button>
        </Tooltip>
      )}
      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {renderActions("small")}
        <Button
          size="small"
          type="text"
          style={{ color: "#666" }}
          onClick={() => {
            onDownload();
            setOpen(false);
          }}
        >
          <Icon name="download" /> Download
        </Button>
      </div>
      <div style={{ color: "#888", fontSize: "11px" }}>
        {info ? info : "plain text"}, {content.split("\n").length} lines
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        zIndex: 2,
      }}
    >
      <Popover
        trigger="click"
        open={open}
        onOpenChange={(next) => setOpen(next)}
        content={actionContent}
        placement="bottomRight"
      >
        <Button
          size="small"
          type="text"
          style={{
            color: "#666",
            transition: "opacity 120ms ease",
            boxShadow: "none",
          }}
          aria-label="Code block actions"
        >
          <Icon name="ellipsis" rotate="90" />
        </Button>
      </Popover>
    </div>
  );
}

export const StaticElement: React.FC<RenderElementProps> = ({
  attributes,
  element,
}) => {
  if (element.type != "code_block") {
    throw Error("bug");
  }

  const { disableMarkdownCodebar, jupyterApiEnabled } = useFileContext();

  // we need both a ref and state, because editing is used both for the UI
  // state and also at once point directly to avoid saving the last change
  // after doing shift+enter.
  const editingRef = useRef<boolean>(false);
  const [editing, setEditing0] = useState<boolean>(false);
  const setEditing = (editing) => {
    editingRef.current = editing;
    setEditing0(editing);
  };

  const [newValue, setNewValue] = useState<string | null>(null);
  const runRef = useRef<any>(null);

  const [output, setOutput] = useState<null | ReactNode>(null);

  const { change, editor, setEditor } = useChange();
  const [history, setHistory] = useState<string[]>(
    getHistory(editor, element) ?? [],
  );
  useEffect(() => {
    const newHistory = getHistory(editor, element);
    if (newHistory != null && !isEqual(history, newHistory)) {
      setHistory(newHistory);
    }
  }, [change]);

  const [temporaryInfo, setTemporaryInfo] = useState<string | null>(null);
  useEffect(() => {
    setTemporaryInfo(null);
  }, [element.info]);

  const save = (value: string | null, run: boolean) => {
    setEditing(false);
    if (value != null && setEditor != null && editor != null) {
      // We just directly find it assuming it is a top level block for now.
      // We aren't using the slate library since in static mode right now
      // the editor isn't actually a slate editor object (yet).
      const editor2 = { children: [...editor.children] };
      for (let i = 0; i < editor2.children.length; i++) {
        if (element === editor.children[i]) {
          editor2.children[i] = { ...(element as any), value };
          setEditor(editor2);
          break;
        }
      }
    }
    if (!run) return;
    // have to wait since above causes re-render
    setTimeout(() => {
      runRef.current?.();
    }, 1);
  };

  const isMermaid = element.info == "mermaid";
  if (isMermaid) {
    return (
      <div {...attributes} style={{ marginBottom: "1em", textIndent: 0 }}>
        <Mermaid value={newValue ?? element.value} />
      </div>
    );
  }

  // textIndent: 0 is needed due to task lists -- see https://github.com/sagemathinc/cocalc/issues/6074
  // editable since even CodeMirrorStatic is editable, but meant to be *ephemeral* editing.
  return (
    <div
      {...attributes}
      style={{ marginBottom: "1em", textIndent: 0, position: "relative" }}
    >
      {!disableMarkdownCodebar && (
        <FloatingActionMenu
          editing={editing}
          info={temporaryInfo ?? element.info}
          onSaveOrEdit={() => {
            if (editing) {
              save(newValue, false);
            } else {
              setEditing(true);
            }
          }}
          canEdit={!!jupyterApiEnabled}
          content={newValue ?? element.value}
          onDownload={() => {
            const blob = new Blob([newValue ?? element.value], {
              type: "text/plain;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const ext = infoToMode(temporaryInfo ?? element.info) || "txt";
            link.download = `code-block.${ext}`;
            link.click();
            URL.revokeObjectURL(url);
          }}
          renderActions={(size = "small") => (
            <ActionButtons
              size={size}
              runRef={runRef}
              input={newValue ?? element.value}
              history={history}
              setOutput={setOutput}
              output={output}
              info={temporaryInfo ?? element.info}
              setInfo={(info) => {
                setTemporaryInfo(info);
              }}
            />
          )}
        />
      )}
      <CodeMirrorStatic
        editable={editing}
        onChange={(event) => {
          if (!editingRef.current) return;
          setNewValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.shiftKey && event.keyCode === 13) {
            save(newValue, true);
          }
        }}
        onDoubleClick={() => {
          setEditing(true);
        }}
        value={newValue ?? element.value}
        style={{
          background: "white",
          padding: "10px 15px 10px 20px",
          borderLeft: `10px solid ${DARK_GREY_BORDER}`,
          borderRadius: 0,
        }}
        options={{
          mode: infoToMode(temporaryInfo ?? element.info, {
            value: element.value,
          }),
        }}
        addonAfter={
          disableMarkdownCodebar || output == null ? null : (
            <div
              style={{
                borderTop: "1px dashed #ccc",
                background: "white",
                padding: "5px 0 5px 30px",
              }}
            >
              {output}
            </div>
          )
        }
      />
    </div>
  );
};

export function toSlate({ token }) {
  // fence =block of code with ``` around it, but not indented.
  let value = token.content;

  // We remove the last carriage return (right before ```), since it
  // is much easier to do that here...
  if (value[value.length - 1] == "\n") {
    value = value.slice(0, value.length - 1);
  }
  const info = token.info ?? "";
  if (typeof info != "string") {
    throw Error("info must be a string");
  }
  return {
    type: "code_block",
    isVoid: true,
    fence: token.type == "fence",
    value,
    info,
    children: [{ text: "" }],
  } as Element;
}

function sizeEstimator({ node, fontSize }): number {
  return node.value.split("\n").length * (fontSize + 2) + 10 + fontSize;
}

register({
  slateType: "code_block",
  markdownType: ["fence", "code_block"],
  StaticElement,
  toSlate,
  sizeEstimator,
});
