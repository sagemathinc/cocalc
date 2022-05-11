/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SlateElement, register } from "../register";
import Hashtag from "./component";

export interface Hashtag extends SlateElement {
  type: "hashtag";
  content: string;
}

register({
  slateType: "hashtag",

  StaticElement: ({ attributes, element }) => {
    if (element.type != "hashtag") throw Error("bug");

    return (
      <span {...attributes}>
        <Hashtag value={element.content} />
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
