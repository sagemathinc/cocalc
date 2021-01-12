/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React, useCallback } from "../../../app-framework";
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
import { SlateMath } from "./math";
import { startswith } from "smc-util/misc";

export const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const editor = useSlate();

  const set = useCallback((element, obj) => {
    try {
      const at = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, obj, { at });
    } catch (err) {
      console.log("SLATE error setting ", obj, err, element);
      return;
    }
  }, []);

  if (element.tag) {
    // We use some extra classes for certain tags so things just look better.
    let className: undefined | string = undefined;
    if (element.tag == "table") {
      className = "table";
    }
    let style = {} as CSS;
    if ((element.tag == "ol" || element.tag == "ul") && !element.tight) {
      // There is a shortcoming in how markdown-it parses nested
      // non-tight lists (at least with the CSS in cocalc), and this
      // is a workaround.  If it is not tight, add space below.
      style.marginBottom = "1em";
    }
    return React.createElement(
      element.tag as string,
      {
        ...attributes,
        ...(element.attrs as object),
        ...{ className },
        ...{ style },
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
    case "hardbreak":
      return (
        <span {...attributes}>
          <span style={{ whiteSpace: "pre" }}>{children}</span>
        </span>
      );
    case "softbreak":
      return (
        <span {...attributes}>
          <span style={{ whiteSpace: "normal" }}>{children}</span>
        </span>
      );
    case "code_block":
      return (
        <div {...attributes}>
          <SlateCodeMirror
            value={element.value as string}
            info={element.info as string | undefined}
            onChange={(value) => set(element, { value })}
          />
          {children}
        </div>
      );
    case "math":
      return (
        <span {...attributes}>
          <SlateMath
            value={element.value as string}
            onChange={(value) => {
              set(element, { value });
            }}
          />
          {children}
        </span>
      );
    case "heading":
      return React.createElement(`h${element.level}`, attributes, children);
    case "checkbox":
      return (
        <span {...attributes}>
          <Checkbox
            style={{ margin: "0 0.5em", verticalAlign: "middle" }}
            checked={!!element.checked}
            onChange={(e) => {
              set(element, { checked: e.target.checked });
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
  //console.log("Leaf ", { children });
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
  if (leaf.sup) {
    children = <sup>{children}</sup>;
  }
  if (leaf.sub) {
    children = <sub>{children}</sub>;
  }
  if (leaf.code) {
    children = <code style={CODE_STYLE}>{children}</code>;
  }
  // check for colors:
  for (const mark in leaf) {
    if (!leaf[mark]) continue; // only if it is true
    if (mark[0] == "#") {
      children = <span style={{ color: mark }}>{children}</span>;
    }
    if (startswith(mark, "font-")) {
      children = <span style={{ fontFamily: mark.slice(5) }}>{children}</span>;
    }
  }

  return <span {...attributes}>{children}</span>;
};
