/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React, { CSSProperties } from "react";
import type { RenderLeafProps } from "./slate-react";
import { startswith } from "@cocalc/util/misc";

// CODE_STYLE -- copied from GitHub
const CODE_STYLE = {
  padding: ".2em .4em",
  margin: 0,
  fontSize: "85%",
  borderRadius: "6px",
} as CSSProperties;

const Leaf: React.FC<RenderLeafProps> = React.memo(
  ({ attributes, children, leaf }) => {
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
    if (leaf.small) {
      children = <small>{children}</small>;
    }
    if (leaf.tt) {
      children = <span style={{ fontFamily: "monospace" }}>{children}</span>;
    }
    // check for colors, fonts, etc.
    for (const mark in leaf) {
      if (!leaf[mark]) continue; // only if it is true
      if (startswith(mark, "color:")) {
        children = (
          <span style={{ color: mark.split(":")[1] }}>{children}</span>
        );
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
    if (leaf.search) {
      // Search highlighting of text nodes.
      // Same color as CodeMirror's default.
      children = <span style={{ backgroundColor: "#ffa" }}>{children}</span>;
    }

    return <span {...attributes}>{children}</span>;
  }
);

export default Leaf;
