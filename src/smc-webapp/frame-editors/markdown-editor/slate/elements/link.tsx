/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register, SlateElement } from "./register";
import { dict } from "smc-util/misc";
import { open_new_tab } from "../../../../misc-page";
const linkify = require("linkify-it")();

export interface Link extends SlateElement {
  type: "link";
  isInline: true;
  attrs: object;
}

register({
  slateType: "link",

  fromSlate: ({ node, children }) => {
    // [my website](wstein.org "here")
    const attrs = (node as any).attrs;
    const href = attrs.href ? `${attrs.href}` : "";
    const title = attrs.title ? ` "${attrs.title}"` : "";
    let link;
    if (title == "" && children == href && linkify.test(href)) {
      // special case where the url is easily parsed by the linkify plugin.
      link = href;
    } else {
      link = `[${children}](${href}${title})`;
    }
    return link;
  },

  Element: ({ attributes, children, element }) => {
    const attrs = (element as any).attrs as object;
    return (
      <a
        {...attributes}
        {...attrs}
        onDoubleClick={() => {
          if (attrs["href"]) {
            open_new_tab(attrs["href"]);
          }
        }}
      >
        {children}
      </a>
    );
  },

  toSlate: ({ type, children, state }) => {
    const attrs = dict(state.attrs as any);
    return { type, children, isInline: true, attrs };
  },
});
