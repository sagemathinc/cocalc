/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { SlateElement, register } from "../register";

export interface Emoji extends SlateElement {
  type: "emoji";
  content: string;
}

export function createEmoji(content: string, markup: string): Emoji {
  return {
    type: "emoji",
    isVoid: true,
    isInline: true,
    content,
    children: [{ text: "" }],
    markup,
  } as Emoji;
}

register({
  slateType: "emoji",

  StaticElement: ({ attributes, element }) => {
    if (element.type != "emoji") throw Error("bug");
    return <span {...attributes}>{element.content}</span>;
  },

  toSlate: ({ token }) => createEmoji(token.content, token.markup),
});
