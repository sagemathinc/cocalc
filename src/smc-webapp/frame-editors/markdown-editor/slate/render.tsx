/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React, useCallback } from "../../../app-framework";
import { HTML } from "../../../r_misc";
import { RenderElementProps, RenderLeafProps, useSlate } from "slate-react";
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

  // I could find no reliable way to locate a specific element that
  // comes into the render, since slate is using immutable js and we
  // haven't broken down and assigned uuid's to nodes yet (and
  // then searched for them.)  So we support setting the part of the
  // selection with a given type, which suffices for our
  // custom editors, since when you focus them, their node is
  // in that selection.
  const set_selection = useCallback((type, obj) => {
    try {
      Transforms.setNodes(editor, obj, { match: (node) => node.type == type });
    } catch (err) {
      console.log("ERROR: set_selection ", { err, type, obj });
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
            onChange={(value) => set_selection(element.type, { value })}
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
              set_selection(element.type, { value });
            }}
          />
          {children}
        </span>
      );
    case "heading":
      const level = element.level as number;
      if (!level || level < 1 || level > 6) {
        return <b>{children}</b>;
      }
      return React.createElement(`h${level}`, attributes, children);
    case "checkbox":
      return (
        <span {...attributes}>
          <Checkbox
            style={{ margin: "0 0.5em", verticalAlign: "middle" }}
            checked={!!element.checked}
            onChange={(e) => {
              set_selection(element.type, {
                checked: e.target.checked,
              });
            }}
          />
          {children}
        </span>
      );

    /* We render tables using straight HTML and the antd
       CSS classes.  We do NOT use the actual antd Table
       class, since it doesn't play well with slatejs.
       I just looked at the DOM in a debugger to figure out
       these tags; the main risk is that things change, but
       it's purely style so that is OK.
    */
    case "table":
      return (
        <div
          {...attributes}
          className="ant-table"
          style={{ fontSize: "inherit" }}
        >
          <table style={{ tableLayout: "auto" }}>{children}</table>
        </div>
      );
    case "thead":
      return (
        <thead {...attributes} className="ant-table-thead">
          {children}
        </thead>
      );
    case "tbody":
      return (
        <tbody {...attributes} className="ant-table-tbody">
          {children}
        </tbody>
      );
    case "tr":
      return (
        <tr {...attributes} className="ant-table-row">
          {children}
        </tr>
      );
    case "td":
      return (
        <td {...attributes} className="ant-table-cell">
          {children}
        </td>
      );
    case "th":
      return (
        <th {...attributes} className="ant-table-cell">
          {children}
        </th>
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
  // check for colors, fonts, etc.
  for (const mark in leaf) {
    if (!leaf[mark]) continue; // only if it is true
    if (startswith(mark, "color:")) {
      children = <span style={{ color: mark.split(":")[1] }}>{children}</span>;
    }
    if (startswith(mark, "font-family:")) {
      children = (
        <span style={{ fontFamily: mark.split(":")[1] }}>{children}</span>
      );
    }
    if (startswith(mark, "font-size:")) {
      children = (
        <span style={{ fontSize: mark.split(":")[1] }}>{children}</span>
      );
    }
  }

  return <span {...attributes}>{children}</span>;
};
