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
    if (children.trim() == "") {
      // We discard empty paragraphs entirely, since that's just
      // what markdown does. Also, to make void blocks easier to
      // work with, we sometimes automatically add blank paragraphs
      // above or below them, and it is silly if those result in
      // lots of meaningless blank lines in the md file.
      return "";
    }
    return `${children}${node.tight ? "\n" : "\n\n"}`;
  },
});
