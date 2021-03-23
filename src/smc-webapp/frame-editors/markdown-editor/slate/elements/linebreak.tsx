/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import {
  register,
  SlateElement,
  useCollapsed,
  useFocused,
  useSelected,
} from "./register";
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
  Element: ({ attributes, children }) => {
    const focused = useFocused();
    const selected = useSelected();
    const collapsed = useCollapsed();
    const reveal = focused && selected && collapsed;
    return (
      <span {...attributes}>
        <span
          style={{
            whiteSpace: "normal",
            borderRight: reveal ? "1px solid #333" : undefined,
            color: reveal ? "lightgrey" : undefined,
          }}
          contentEditable={false}
        >
          {reveal ? "↵" : " "}
        </span>
        {children}
      </span>
    );
  },

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

  fromSlate: ({ children }) => {
    return children + "  \n";
  },

  Element: ({ attributes, children }) => {
    const focused = useFocused();
    const selected = useSelected();
    const collapsed = useCollapsed();
    const reveal = focused && selected && collapsed;
    return (
      <span {...attributes}>
        <span
          style={{
            whiteSpace: "pre",
            borderRight: reveal ? "1px solid #333" : undefined,
            color: reveal ? "lightgrey" : undefined,
          }}
          contentEditable={false}
        >
          {reveal ? "↵\n" : "\n"}
        </span>
        {children}
      </span>
    );
  },

  toSlate: hardbreak,
});
