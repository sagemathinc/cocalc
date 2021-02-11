/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { ensure_ends_in_newline, li_indent } from "../util";
import { register, SlateElement } from "./register";

export interface ListItem extends SlateElement {
  type: "list_item";
}

register({
  slateType: "list_item",

  toSlate: ({ children }) => {
    return { type: "list_item", children };
  },

  Element: ({ attributes, children }) => {
    return <li {...attributes}>{children}</li>;
  },

  fromSlate: ({ children, info }) => {
    return ensure_ends_in_newline(li_indent(item({ children, info })));
  },
});

function item({ children, info }): string {
  if (info.parent == null) {
    // should never happen for list *items*.
    return `- ${children}`;
  } else if (info.parent.type == "bullet_list") {
    return `- ${children}`;
  } else if (info.parent.type == "ordered_list") {
    return `${(info.index ?? 0) + (info.parent.start ?? 1)}. ${children}`;
  } else {
    // should also never happen
    return `- ${children}`;
  }
}
