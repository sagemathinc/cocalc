/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { register, SlateElement } from "./register";

export interface Paragraph extends SlateElement {
  type: "paragraph";
}

register({
  slateType: "paragraph",

  toSlate: ({ token, children }) => {
    // We include a tight property when hidden is true, since that's the
    // hack that markdown-it uses for parsing tight lights.
    return {
      ...{ type: "paragraph", children },
      ...(token.hidden ? { tight: true } : {}),
    };
  },

  Element: ({ attributes, children, element }) => {
    if (element.type != "paragraph") throw Error("bug");
    if (element.tight) {
      return <span {...attributes}>{children}</span>;
    }
    return <p {...attributes}>{children}</p>;
  },

  fromSlate: ({ node, children }) => {
    if (children.trim() == "" && !node.tight) {
      // NOTE: vertical space will get lost.  That's the nature of markdown.
      return "\n\n";
    }
    return `${children}${node.tight ? "\n" : "\n\n"}`;
  },
});
