/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { FOCUSED_COLOR } from "../../util";
import { register } from "../register";
import { useFocused, useSelected } from "../hooks";
import { STYLE } from "./index";

register({
  slateType: "hashtag",

  Element: ({ attributes, children, element }) => {
    if (element.type != "hashtag") throw Error("bug");
    const focused = useFocused();
    const selected = useSelected();

    const border =
      focused && selected ? `1px solid ${FOCUSED_COLOR}` : "1px solid #d9d9d9";
    const backgroundColor = focused && selected ? "#1990ff" : "#fafafa";
    const color = focused && selected ? "white" : "#1b95e0";

    return (
      <span {...attributes}>
        <span style={{ ...STYLE, border, backgroundColor, color }}>
          #{element.content}
        </span>
        {children}
      </span>
    );
  },

  fromSlate: ({ node }) => `#${node.content}`,
});
