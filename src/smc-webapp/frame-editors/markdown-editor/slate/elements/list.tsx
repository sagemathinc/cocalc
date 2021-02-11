/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../../../../app-framework";
import { register, SlateElement } from "./register";
import { DEFAULT_CHILDREN } from "../util";
import { Element } from "slate";

export interface BulletList extends SlateElement {
  type: "bullet_list";
}

export interface OrderedList extends SlateElement {
  type: "ordered_list";
  start?: number;
}

export function bullet_list(children = DEFAULT_CHILDREN): Element {
  return { type: "bullet_list", children };
}

export function ordered_list(children = DEFAULT_CHILDREN, start): Element {
  return { type: "ordered_list", children, start };
}

register({
  slateType: ["bullet_list", "ordered_list"],

  toSlate: ({ type, children, state }) => {
    if (type == "bullet_list") {
      return bullet_list(children);
    } else {
      return ordered_list(children, state.attrs?.[0]?.[1]);
    }
  },

  Element: ({ attributes, children, element }) => {
    let style = {} as CSS;
    if (!element.tight) {
      // There is IMHO a shortcoming in how markdown-it parses nested
      // non-tight lists (at least with the CSS in cocalc), and this
      // is a workaround.  If it is not tight, add space below.
      style.marginBottom = "1em";
    }
    const start =
      element.type == "ordered_list" && element.start
        ? { start: element.start }
        : {};

    return React.createElement(
      element.type == "bullet_list" ? "ul" : "ol",
      {
        ...attributes,
        ...{ style },
        ...start,
      },
      children
    );
  },

  fromSlate: ({ node, info, children }) => {
    let s = children;
    if (
      s[s.length - 2] != "\n" &&
      !(info.parent?.type == "list_item" && node.tight)
    ) {
      // lists should end with two new lines, unless parent is an item in a tight list.
      s += "\n";
    }
    return s;
  },

  rules: { autoFocus: true },
});
