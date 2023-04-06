// import { useFileContext } from "@cocalc/frontend/lib/file-context";
//import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Space } from "antd";
import { Node, Path, Transforms } from "slate";
import { findElement } from "../../control";
import { toSlate } from "./index";
import { ReactEditor } from "../../slate-react";

function SmallButton({ children, onClick }) {
  return (
    <Button
      type="link"
      size="small"
      style={{ fontSize: "11px" }}
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
  //const { hasOpenAI } = useFileContext();

  const insert = (node: Node, offset = 0) => {
    let path = findElement(editor, element);
    if (path && !above) {
      path = Path.next(path);
    }
    Transforms.insertNodes(editor, node, { at: path });
    ReactEditor.focus(editor, true);
    if (path) {
      setTimeout(() => {
        const sel = {
          anchor: { path: path!, offset: 0 },
          focus: { path: path!, offset },
        };
        Transforms.setSelection(editor, sel);
        ReactEditor.focus(editor, true);
      }, 50);
    }
  };

  return (
    <div
      className="cocalc-slate-insert-cell"
      style={{
        height: "1em",
        cursor: "pointer",
        paddingTop: "1.5px",
      }}
    >
      <div className="cocalc-slate-insert-cell-controls">
        <Space size="large">
          <SmallButton
            onClick={() => {
              insert(toSlate({ token: { content: "", info, type: "fence" } }));
            }}
          >
            <Icon name="code" /> Code
          </SmallButton>
          <SmallButton
            onClick={() => {
              insert(
                {
                  type: "paragraph",
                  children: [{ text: "Text" }],
                },
                "Text".length
              );
            }}
          >
            <Icon name="pen" /> Text
          </SmallButton>
          {/*<SmallButton>
            <Icon name="paste" /> Paste
          </SmallButton>
          {hasOpenAI ? (
            <SmallButton>
              <OpenAIAvatar
                size={12}
                style={{ marginRight: "5px" }}
                innerStyle={{ top: "2px" }}
              />{" "}
              ChatGPT
            </SmallButton>
          ) : undefined}
          */}
        </Space>
      </div>
    </div>
  );
}
