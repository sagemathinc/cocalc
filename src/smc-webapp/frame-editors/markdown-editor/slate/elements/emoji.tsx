/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { FOCUSED_COLOR } from "../util";
import { SlateElement, register, useFocused, useSelected } from "./register";

export interface Emoji extends SlateElement {
  type: "emoji";
  content: string;
}

register({
  slateType: "emoji",

  fromSlate: ({ node }) => `:${node.markup}:`,

  Element: ({ attributes, children, element }) => {
    if (element.type != 'emoji') throw Error('bug');
    const focused = useFocused();
    const selected = useSelected();

    const border =
      focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid white`;

    return (
      <span {...attributes} style={{ border }}>
        {element.content}
        {children}
      </span>
    );
  },

  toSlate: ({ token }) => {
    return {
      type: "emoji",
      isVoid: true,
      isInline: true,
      content: token.content,
      children: [{ text: " " }],
      markup: token.markup,
    };
  },
});
