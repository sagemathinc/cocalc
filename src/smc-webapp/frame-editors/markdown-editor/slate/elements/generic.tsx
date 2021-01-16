/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../../../../app-framework";
import { string_to_style } from "../util";
import { register } from "../register";
import { dict } from "smc-util/misc";
import { Node } from "slate";

register({
  slateType: "", // this is the generic plugin

  fromSlate: ({ children }) => `${children}\n`,

  Element: ({ attributes, children, element }) => {
    if (element.tag) {
      let style = {} as CSS;
      if ((element.tag == "ol" || element.tag == "ul") && !element.tight) {
        // TODO: move to plugin specifically for lists!!

        // There is a shortcoming in how markdown-it parses nested
        // non-tight lists (at least with the CSS in cocalc), and this
        // is a workaround.  If it is not tight, add space below.
        style.marginBottom = "1em";
      }

      return React.createElement(
        element.tag as string,
        {
          ...attributes,
          ...(element.attrs as object),
          ...{ style },
        },
        children
      );
    }
    if (element.tight) {
      return (
        <span {...attributes} {...element.attrs}>
          {children}
        </span>
      );
    }
    return (
      <p {...attributes} {...element.attrs}>
        {children}
      </p>
    );
  },

  toSlate: ({ token, type, children, state }) => {
    const node = { type, children } as Node;
    if (!state.block) {
      node.isInline = true;
    }
    if (token.tag && token.tag != "p") {
      node.tag = token.tag;
    }
    if (state.attrs != null) {
      const a: any = dict(state.attrs as any);
      if (a.style != null) {
        a.style = string_to_style(a.style as any);
      }
      node.attrs = a;
    }
    return node;
  },
});
