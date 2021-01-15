/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React, useCallback } from "../../../app-framework";
import { HTML } from "../../../r_misc";
import { RenderElementProps, RenderLeafProps, useSlate } from "slate-react";
import { Transforms } from "slate";
import { SlateCodeMirror } from "./codemirror";
import { SlateMath } from "./math";
import { startswith } from "smc-util/misc";
import { TableElement } from "./render-table";
import { getRender } from "./register";

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
  const set_props_of_selected_node = useCallback((type, obj) => {
    try {
      Transforms.setNodes(editor, obj, { match: (node) => node.type == type });
    } catch (err) {
      console.log("ERROR: set_props_of_selected_node ", { err, type, obj });
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
          <code style={{ color: "#aaa" }}>{element.html as string}</code>
          {is_br(element.html as string) && <br />}
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
            onChange={(value) =>
              set_props_of_selected_node(element.type, { value })
            }
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
              set_props_of_selected_node(element.type, { value });
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

    case "table":
    case "thead":
    case "tbody":
    case "tr":
    case "th":
    case "td":
      return (
        <TableElement
          attributes={attributes}
          children={children}
          element={element}
        />
      );

    default:
      const C = getRender(element.type as string);
      if (C != null) {
        return React.createElement(C, {
          attributes,
          children,
          element,
        });
      }

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

function is_br(s: string): boolean {
  const x = s.toLowerCase().replace(/\s/g, "");
  return x == "<br>" || x == "<br/>";
}
