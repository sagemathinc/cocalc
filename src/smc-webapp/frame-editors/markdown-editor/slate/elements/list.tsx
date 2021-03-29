/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register, SlateElement } from "./register";
import { DEFAULT_CHILDREN } from "../util";
import { Element } from "slate";

export interface BulletList extends SlateElement {
  type: "bullet_list";
  tight?: boolean;
}

export interface OrderedList extends SlateElement {
  type: "ordered_list";
  start?: number;
  tight?: boolean;
}

export function bullet_list(
  children = DEFAULT_CHILDREN,
  tight: boolean = true
): Element {
  return { type: "bullet_list", children, tight };
}

export function ordered_list(
  children = DEFAULT_CHILDREN,
  start,
  tight: boolean = true
): Element {
  return { type: "ordered_list", children, start, tight };
}

register({
  slateType: ["bullet_list", "ordered_list"],

  toSlate: ({ type, children, state }) => {
    if (type == "bullet_list") {
      return bullet_list(children, state.tight);
    } else {
      return ordered_list(children, state.attrs?.[0]?.[1], state.tight);
    }
  },

  Element: ({ attributes, children, element }) => {
    if (element.type != "ordered_list" && element.type != "bullet_list") {
      throw Error("Element must be a list");
    }

    const start =
      element.type == "ordered_list" && element.start != null
        ? { start: element.start }
        : {};

    return React.createElement(
      element.type == "bullet_list" ? "ul" : "ol",
      {
        ...attributes,
        ...start,
        className: element.tight
          ? "cocalc-slate-tight-list"
          : "cocalc-slate-nontight-list",
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
      // list should end with two new lines, unless parent is an item in a tight list.
      s += "\n";
    }
    return s;
  },

  rules: { autoFocus: true },
});
