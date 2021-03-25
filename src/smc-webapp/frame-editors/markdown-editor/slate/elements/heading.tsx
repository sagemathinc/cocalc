/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { register, SlateElement } from "./register";
import { mark_block } from "../util";
import { HeadingToggle } from "./heading-toggle";

export interface Heading extends SlateElement {
  type: "heading";
  level: number;
}

register({
  slateType: "heading",

  toSlate: ({ token, children }) => {
    return {
      type: "heading",
      level: parseInt(token.tag?.slice(1) ?? "1"),
      children,
    };
  },

  Element: ({ attributes, children, element }) => {
    if (element.type != "heading") throw Error("bug");
    const { level } = element;
    if (!level || level < 1 || level > 6) {
      // Shouldn't be allowed, but at least we can render it somehow...
      return <b>{children}</b>;
    }
    return React.createElement(
      `h${level}`,
      attributes,
      [<HeadingToggle compressed={Math.random() > 0.5} key="toggle" />].concat(
        children
      )
    );
  },

  fromSlate: ({ node, children }) => {
    let h = "\n#";
    for (let n = 1; n < ((node.level as any) ?? 1); n++) {
      h += "#";
    }
    return mark_block(children, h).trim() + "\n\n";
  },

  rules: { autoFocus: true },
});
