/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register, SlateElement } from "../register";
import { Element } from "slate";

export interface Softbreak extends SlateElement {
  type: "softbreak";
  isInline: true;
  isVoid: true;
}

register({
  slateType: "softbreak",

  toSlate: () => {
    return {
      type: "softbreak",
      isInline: true,
      isVoid: true,
      children: [{ text: "" }],
    };
  },

  // A softbreak creates a new line without creating
  // a new paragraph.
  StaticElement: ({ attributes, children }) => {
    return (
      <span {...attributes}>
        <span style={{ whiteSpace: "normal" }}> </span>
        {children}
      </span>
    );
  },
});

export interface Hardbreak extends SlateElement {
  type: "hardbreak";
  isInline: true;
  isVoid: true;
}

export function hardbreak() {
  return {
    type: "hardbreak",
    isInline: true,
    isVoid: true,
    children: [{ text: "" }],
  } as Element;
}

register({
  slateType: "hardbreak",

  StaticElement: ({ attributes, children }) => {
    return (
      <span {...attributes}>
        <span style={{ whiteSpace: "pre" }}>{"\n"}</span>
        {children}
      </span>
    );
  },

  toSlate: hardbreak,
});
