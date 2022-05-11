/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SlateElement, register } from "../register";

export interface Emoji extends SlateElement {
  type: "emoji";
  content: string;
}

register({
  slateType: "emoji",

  StaticElement: ({ attributes, element }) => {
    if (element.type != "emoji") throw Error("bug");
    return <span {...attributes}>{element.content}</span>;
  },

  toSlate: ({ token }) => {
    return {
      type: "emoji",
      isVoid: true,
      isInline: true,
      content: token.content,
      children: [{ text: "" }],
      markup: token.markup,
    };
  },
});
