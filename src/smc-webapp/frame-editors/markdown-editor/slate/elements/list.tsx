/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../../../../app-framework";
import { register } from "./register";

register({
  slateType: ["bullet_list", "ordered_list"],

  toSlate: ({ token, type, children, state }) => {
    return { type, tag: token.tag, children, start: state.attrs?.[0]?.[1] };
  },

  Element: ({ attributes, children, element }) => {
    let style = {} as CSS;
    if (!element.tight) {
      // There is IMHO a shortcoming in how markdown-it parses nested
      // non-tight lists (at least with the CSS in cocalc), and this
      // is a workaround.  If it is not tight, add space below.
      style.marginBottom = "1em";
    }

    return React.createElement(
      element.tag as string,
      {
        ...attributes,
        ...{ style },
        ...{ start: element.start },
      },
      children
    );
  },

  fromSlate: ({ node, info, children }) => {
    let s = children;
    if (
      s[s.length - 2] != "\n" &&
      !(info.parent.type == "list_item" && node.tight)
    ) {
      // lists should end with two new lines, unless parent is an item in a tight list.
      s += "\n";
    }
    return s;
  },
});
