/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { register, SlateElement } from "../register";
import { DEFAULT_CHILDREN } from "../../util";
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

  StaticElement: ({ attributes, children, element }) => {
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
});
