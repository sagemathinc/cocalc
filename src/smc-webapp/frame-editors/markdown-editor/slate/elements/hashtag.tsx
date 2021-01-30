/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../../../../app-framework";
import { FOCUSED_COLOR } from "../util";
import {
  SlateElement,
  register,
  useFocused,
  useSelected,
  useCollapsed,
} from "./register";

export interface Hashtag extends SlateElement {
  type: "hashtag";
  content: string;
}

// Looks like antd tag but scales (and a lot simpler).
const STYLE = {
  padding: "0 7px",
  color: "#1b95e0",
  borderRadius: "5px",
} as CSS;

register({
  slateType: "hashtag",

  fromSlate: ({ node }) => `#${node.content}`,

  Element: ({ attributes, children, element }) => {
    if (element.type != "hashtag") throw Error("bug");
    const focused = useFocused();
    const selected = useSelected();
    const collapsed = useCollapsed();

    const border =
      focused && selected ? `1px solid ${FOCUSED_COLOR}` : "1px solid #d9d9d9";
    const backgroundColor =
      focused && selected && !collapsed ? "#1990ff" : "#fafafa";

    return (
      <span {...attributes}>
        <span style={{ ...STYLE, border, backgroundColor }}>
          #{element.content}
        </span>
        {children}
      </span>
    );
  },

  toSlate: ({ token }) => {
    return {
      type: "hashtag",
      isVoid: true,
      isInline: true,
      content: token.content,
      children: [{ text: " " }],
      markup: token.markup,
    };
  },
});
