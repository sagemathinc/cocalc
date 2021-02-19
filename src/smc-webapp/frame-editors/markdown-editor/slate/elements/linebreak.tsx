/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register, SlateElement } from "./register";
import { Element } from "slate";

export interface Softbreak extends SlateElement {
  type: "softbreak";
  isInline: true;
  isVoid: false;
}

register({
  slateType: "softbreak",

  toSlate: () => {
    return {
      type: "softbreak",
      isInline: true,
      isVoid: false,
      children: [{ text: "\n" }],
    };
  },

  // A softbreak creates a new line without creating
  // a new paragraph.
  Element: ({ attributes, children }) => (
    <span {...attributes}>
      <span style={{ whiteSpace: "normal" }}>{children}</span>
    </span>
  ),

  fromSlate: ({ children }) => {
    // Just in case somehow the children were edited
    // (it doesn't seem they can be), we still won't
    // loose information:
    return children;
  },
});

export interface Hardbreak extends SlateElement {
  type: "hardbreak";
  isInline: true;
  isVoid: false;
}

export function hardbreak() {
  return {
    type: "hardbreak",
    isInline: true,
    isVoid: false,
    children: [{ text: "\n" }],
  } as Element;
}

register({
  slateType: "hardbreak",

  fromSlate: ({ children }) => {
    // IMPORTANT: the children of a hardbreak can get their
    // texted edited, so it's important to actually include
    // the children here, or text just disappears in conversion
    // to source:
    return "  " + children;
  },

  Element: ({ attributes, children }) => (
    <span {...attributes}>
      <span style={{ whiteSpace: "pre" }}>{children}</span>
    </span>
  ),

  toSlate: hardbreak,
});
