/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { register, SlateElement } from "./register";
import { DEFAULT_CHILDREN } from "../util";
import { Element } from "slate";
import { isEqual } from "lodash";

export interface BulletList extends SlateElement {
  type: "bullet_list";
  tight?: boolean;
}

export interface OrderedList extends SlateElement {
  type: "ordered_list";
  start?: number;
  tight?: boolean;
}

export function isListElement(element: SlateElement): boolean {
  return (
    Element.isElement(element) &&
    (element.type == "bullet_list" || element.type == "ordered_list")
  );
}

const EMPTY_LIST_ITEM = {
  type: "list_item",
  children: [{ text: "" }],
};
Object.freeze(EMPTY_LIST_ITEM);

export function bullet_list(
  children = DEFAULT_CHILDREN,
  tight: boolean = true
): Element {
  if (!tight && children.length == 1 && isEqual(children[0], EMPTY_LIST_ITEM)) {
    // Annoying special case -- our parser based on markdown-it views completely empty
    // lists (so exactly one item and it is empty) as NOT tight.  However, a list with
    // one letter in it is tight, so this special case is wrong.  We fix that here.
    tight = true;
  }
  return { type: "bullet_list", children, tight };
}

export function ordered_list(
  children = DEFAULT_CHILDREN,
  start,
  tight: boolean = true
): Element {
  if (!tight && children.length == 1 && isEqual(children[0], EMPTY_LIST_ITEM)) {
    // See comment above in bullet_list.
    tight = true;
  }
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
    if (
      node.type == "ordered_list" &&
      node.start != null &&
      node.start != 1 &&
      info.parent?.type == "list_item"
    ) {
      /*
      This is a weird case, but if you put an enumerated list that starts
      with anything except 1 inside of another list without a leading newline,
      then it breaks.  It works fine with 1.  Several markdown parsers do
      this, so whatever.  Note that this makes it impossible to have an
      ordered list nested inside a tight list if the numeration starts at
      a value other than 1.  Again, this is the way it is.  (Note: This sort
      of looks like it works without the newline but that's because of breaks=true.)
      Example -- the following does not work right, but if you change "2. xyz"
      to "1. xyz" then it does.

1. abc
   2. xyz
   3. foo
2. xyz
      */
      s = "\n" + s;
    }
    return s;
  },

  rules: { autoFocus: true },
});
