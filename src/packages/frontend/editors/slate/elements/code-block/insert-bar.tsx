//import { useFileContext } from "@cocalc/frontend/lib/file-context";
// import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import { Button } from "antd";
import { Node, Path, Transforms } from "slate";
import { findElement } from "../../control";
import { toSlate } from "./index";
import { ReactEditor } from "../../slate-react";
import { toDisplayMath } from "../math/index";

function InsertButton({ children, onClick }) {
  return (
    <Button
      style={{ color: "#666" }}
      size="small"
      onClick={(e) => {
        e.stopPropagation(); // keep the editor with the insert bar itself from getting selected
        e.preventDefault();
        onClick(e);
      }}
    >
      {children}
    </Button>
  );
}

export default function InsertBar({ editor, element, info, above }) {
  //const { hasLanguageModel } = useFileContext();

  const insert = (node: Node, offset = 0) => {
    let path = findElement(editor, element);
    if (path && !above) {
      path = Path.next(path);
    }
    Transforms.insertNodes(editor, node, { at: path });
    ReactEditor.focus(editor, true, true);
    if (path) {
      setTimeout(() => {
        const sel = {
          anchor: { path: path!, offset: 0 },
          focus: { path: path!, offset },
        };
        Transforms.setSelection(editor, sel);
        ReactEditor.focus(editor, true, true);
      }, 50);
    }
  };

  return (
    <div
      className="cocalc-slate-insert-cell"
      style={{
        height: "28px",
        cursor: "pointer",
        paddingTop: "8px",
      }}
    >
      <div className="cocalc-slate-insert-cell-controls">
        <Button.Group>
          <InsertButton
            onClick={() => {
              insert(toSlate({ token: { content: "", info, type: "fence" } }));
            }}
          >
            <Icon name="code" /> Code
          </InsertButton>
          <InsertButton
            onClick={() => {
              insert(
                {
                  type: "paragraph",
                  children: [{ text: "Text" }],
                },
                "Text".length,
              );
            }}
          >
            <Icon name="pen" /> Text
          </InsertButton>
          <InsertButton
            onClick={() => {
              insert(toDisplayMath({ token: { content: "x" } }));
            }}
          >
            <Icon name="superscript" /> Math
          </InsertButton>
          {/* {hasLanguageModel ? (
            <InsertButton
              onClick={() => {
                console.log("TODO!");
              }}
            >
              <OpenAIAvatar
                size={16}
                style={{ marginRight: "5px" }}
                innerStyle={{ top: "1.5px" }}
              />{" "}
              ChatGPT...
            </InsertButton>
          ) : undefined}<InsertButton>
            <Icon name="paste" /> Paste
          </InsertButton>
          */}
        </Button.Group>
      </div>
    </div>
  );
}
