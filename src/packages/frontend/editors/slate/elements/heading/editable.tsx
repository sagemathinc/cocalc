/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { ReactEditor } from "../../slate-react";
import { register } from "../register";
import { useSlateStatic } from "../hooks";
import { HeadingToggle } from "./toggle";
import { mark_block } from "../../util";

register({
  slateType: "heading",

  Element: ({ attributes, children, element }) => {
    const editor = useSlateStatic();
    if (element.type != "heading") throw Error("bug");
    const { level } = element;
    if (!level || level < 1 || level > 6) {
      // Shouldn't be allowed, but at least we can render it somehow...
      return <b>{children}</b>;
    }
    let x;
    if (ReactEditor.isUsingWindowing(editor)) {
      x = [
        <HeadingToggle element={element} key="toggle" />,
        <span key="children">{children}</span>,
      ];
    } else {
      x = children;
    }
    return React.createElement(`h${level}`, attributes, x);
  },

  fromSlate: ({ node, children }) => {
    let h = "\n#";
    for (let n = 1; n < ((node.level as any) ?? 1); n++) {
      h += "#";
    }
    return mark_block(children, h).trim() + "\n\n";
  },

  rules: { autoFocus: true, autoAdvance: false },
});
