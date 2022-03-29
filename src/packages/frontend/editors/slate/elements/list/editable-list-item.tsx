/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ensure_ends_in_newline, li_indent } from "../../util";
import { register } from "../register";

register({
  slateType: "list_item",

  fromSlate: ({ children, info }) => {
    let indent = 2;
    let item: string;

    if (info.parent == null) {
      // should never happen for list *items*.
      item = `- ${children}`;
    } else if (info.parent.type == "bullet_list") {
      item = `- ${children}`;
    } else if (info.parent.type == "ordered_list") {
      const number = `${(info.index ?? 0) + (info.parent.start ?? 1)}`;
      indent = number.length + 2;
      item = `${number}. ${children}`;
    } else {
      // should also never happen
      item = `- ${children}`;
    }

    let s = ensure_ends_in_newline(li_indent(item, indent));
    if (!info.parent?.tight) {
      // NOTE: the ? above is so this code works even if the document
      // structure is invalid.
      s += "\n";
    } else {
      // if it is tight, make sure it ends with a single newline instead of 2.
      // This comes up only because of caching of the markdown that produces something.
      // E.g., if you take a non-tight list in source, then edit it in slate to make it tight, then export back to source.
      if (s.endsWith("\n\n")) {
        s = s.slice(0, s.length - 1);
      }
    }
    return s;
  },
});
