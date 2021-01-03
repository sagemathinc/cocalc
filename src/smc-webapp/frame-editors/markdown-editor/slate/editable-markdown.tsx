/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

/* TODO:

*/

import { SAVE_DEBOUNCE_MS } from "../../code-editor/const";
import { debounce } from "lodash";
import {
  React,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "../../../app-framework";
import { Actions } from "../actions";
import { Node, createEditor } from "slate";
import { Slate, Editable, withReact } from "slate-react";
import { slate_to_markdown } from "./slate-to-markdown";
import { markdown_to_slate } from "./markdown-to-slate";

interface Props {
  actions: Actions;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value: string;
  reload_images: boolean;
}

function renderElement(props): JSX.Element {
  if (props.element.tag) {
    // We use some extra classes for certain tags so things just look better.
    let className: undefined | string = undefined;
    if (props.element.tag == "table") {
      className = "table";
    }
    return React.createElement(
      props.element.tag,
      { ...props.attributes, ...{ className } },
      props.children
    );
  }
  switch (props.element.type) {
    case "html_inline":
      return (
        <code {...props.attributes} style={{ color: "#666" }}>
          {props.children}
        </code>
      );
    default:
      return <p {...props.attributes}>{props.children}</p>;
  }
}

export const EditableMarkdown: React.FC<Props> = ({
  actions,
  font_size,
  value,
}) => {
  const editor = useMemo(() => withReact(createEditor()), []);
  const lastSavedValueRef = useRef<string>();
  const [editor_value, setEditorValue] = useState<Node[]>([]);

  // We don't want to do save_value too much, since it presumably can be slow,
  // especially if the document is large. By debouncing, we only do this when
  // the user pauses typing for a moment. Also, this avoids making too many commits.
  const save_value = useMemo(
    () =>
      debounce((doc) => {
        const new_value: string = slate_to_markdown(doc);
        lastSavedValueRef.current = new_value;
        actions.set_value(new_value);
      }, SAVE_DEBOUNCE_MS),
    []
  );

  useEffect(() => {
    if (value === lastSavedValueRef.current) {
      // Setting to the value we just saved -- no-op
      return;
    }
    setEditorValue(markdown_to_slate(value));
  }, [value]);

  return (
    <div
      style={{
        overflowY: "auto",
        fontSize: font_size,
        width: "100%",
        maxWidth: "900px",
        margin: "10px auto",
        padding: "0px 10px",
      }}
      className="smc-vfill"
    >
      <Slate
        editor={editor}
        value={editor_value}
        onChange={(new_value) => {
          setEditorValue(new_value);
          save_value(new_value);
        }}
      >
        <Editable renderElement={renderElement} />
      </Slate>
    </div>
  );
};
