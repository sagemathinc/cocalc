/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { SlateElement, register } from "../register";

export interface Hashtag extends SlateElement {
  type: "hashtag";
  content: string;
}

// Looks like antd tag but scales (and a lot simpler).
export const STYLE = {
  padding: "0 7px",
  color: "#1b95e0",
  borderRadius: "5px",
  cursor: "pointer",
} as React.CSSProperties;

register({
  slateType: "hashtag",

  StaticElement: ({ attributes, element }) => {
    if (element.type != "hashtag") throw Error("bug");

    return (
      <span {...attributes}>
        <span
          style={{
            ...STYLE,
            border: "1px solid #d9d9d9",
            backgroundColor: "#fafafa",
          }}
        >
          #{element.content}
        </span>
      </span>
    );
  },

  toSlate: ({ token }) => {
    return {
      type: "hashtag",
      isVoid: true,
      isInline: true,
      content: token.content,
      children: [{ text: "" }],
      markup: token.markup,
    };
  },
});
