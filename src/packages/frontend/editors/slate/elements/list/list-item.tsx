/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Element } from "slate";
import { register, SlateElement } from "../register";

export interface ListItem extends SlateElement {
  type: "list_item";
}

register({
  slateType: "list_item",

  toSlate: ({ children }) => {
    return { type: "list_item", children };
  },

  StaticElement: ({ attributes, children, element }) => {
    if (isTask(element)) {
      // This is similar to how GitHub does it, and not more hacky.
      return (
        <li
          {...attributes}
          style={{ listStyleType: "none", textIndent: "-28px" }}
        >
          {children}
        </li>
      );
    }
    return <li {...attributes}>{children}</li>;
  },
});

function isTask(element: Element): boolean {
  return element.children[0]?.["children"]?.[1]?.type == "checkbox";
}
