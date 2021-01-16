/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { li_indent } from "../util";
import { register } from "../register";

register({
  slateType: "list_item",

  toSlate: ({ children }) => {
    return { type: "list_item", children };
  },

  Element: ({ attributes, children }) => {
    return <li {...attributes}>{children}</li>;
  },

  fromSlate: ({ children, info }) => {
    if (info?.parent == null) {
      return li_indent(`- ${children}`);
    } else if (info.parent.type == "bullet_list") {
      return li_indent(`- ${children}`);
    } else if (info.parent.type == "ordered_list") {
      return li_indent(
        `${
          (info.index ?? 0) + ((info.parent.attrs as any)?.start ?? 1)
        }. ${children}`
      );
    } else {
      // Unknown list type??
      return children;
    }
  },
});
