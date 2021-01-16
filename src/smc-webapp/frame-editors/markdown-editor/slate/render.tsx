/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../../../app-framework";
import { RenderElementProps, RenderLeafProps } from "slate-react";
import { startswith } from "smc-util/misc";
import { getRender } from "./register";

export const Element: React.FC<RenderElementProps> = (props) => {
  const Component = getRender(props.element.type as string);
  return React.createElement(Component, props);
};

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
