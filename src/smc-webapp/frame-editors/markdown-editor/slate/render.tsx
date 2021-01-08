/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../../../app-framework";
import { HTML } from "../../../r_misc";
import {
  RenderElementProps,
  RenderLeafProps,
  useSlate,
  ReactEditor,
} from "slate-react";
import { Transforms } from "slate";
import { Checkbox } from "antd";
import { SlateCodeMirror } from "./codemirror";

export const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const editor = useSlate();
  if (element.tag) {
    // We use some extra classes for certain tags so things just look better.
    let className: undefined | string = undefined;
    if (element.tag == "table") {
      className = "table";
    }
    return React.createElement(
      element.tag as string,
      {
        ...attributes,
        ...(element.attrs as object),
        ...{ className },
      },
      children
    );
  }
  switch (element.type) {
    case "hr":
      // See https://css-tricks.com/examples/hrs/ for the cool style...
      return (
        <div {...attributes}>
          <hr
            style={{
              border: 0,
              height: "1px",
              background: "#333",
              backgroundImage: "linear-gradient(to right, #ccc, #333, #ccc)",
            }}
          />
          {children}
        </div>
      );
    case "html_block":
      /*style={ maybe only see when **focused** {
            borderLeft: "3px solid #a00",
            marginLeft: "-8px",
            paddingLeft: "5px",
          }}*/
      return (
        <div {...attributes}>
          <HTML auto_render_math={true} value={element.html as string} />
          {children}
        </div>
      );
    case "html_inline":
      return (
        <span {...attributes}>
          <code style={{ color: "#a00" }}>{element.html as string}</code>
          {children}
        </span>
      );
    case "emoji":
      return (
        <span {...attributes}>
          {element.content}
          {children}
        </span>
      );
    case "code_block":
      return (
        <div {...attributes}>
          <SlateCodeMirror
            value={element.value as string}
            info={element.info as string | undefined}
            onChange={(value) => {
              Transforms.setNodes(
                editor,
                { value },
                { at: ReactEditor.findPath(editor, element) }
              );
            }}
          />
          {children}
        </div>
      );
    case "math":
      return (
        <span {...attributes}>
          <HTML auto_render_math={true} value={element.value as string} />
          {children}
        </span>
      );
    case "checkbox":
      return (
        <span {...attributes}>
          <Checkbox
            style={{ margin: "0 0.5em", verticalAlign: "middle" }}
            checked={!!element.checked}
            onChange={(e) => {
              Transforms.setNodes(
                editor,
                { checked: e.target.checked },
                { at: ReactEditor.findPath(editor, element) }
              );
            }}
          />
          {children}
        </span>
      );
    default:
      if (element.tight) {
        return (
          <span {...attributes} {...element.attrs}>
            {children}
          </span>
        );
      }
      return (
        <p {...attributes} {...element.attrs}>
          {children}
        </p>
      );
  }
};

// Temporary to match markdown-it demo, so at least it is usable.
const CODE_STYLE = {
  padding: "2px 4px",
  fontSize: "90%",
  color: "#c7254e",
  backgroundColor: "#f9f2f4",
  borderRadius: "4px",
} as CSS;

export const Leaf: React.FC<RenderLeafProps> = ({
  attributes,
  children,
  leaf,
}) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }
  if (leaf.italic) {
    children = <em>{children}</em>;
  }
  if (leaf.strikethrough) {
    children = <s>{children}</s>;
  }
  if (leaf.underline) {
    children = <u>{children}</u>;
  }
  if (leaf.code) {
    children = <code style={CODE_STYLE}>{children}</code>;
  }

  return <span {...attributes}>{children}</span>;
};
