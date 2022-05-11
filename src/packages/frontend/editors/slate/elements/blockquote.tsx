/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { mark_block } from "../util";
import { register, SlateElement } from "./register";

export interface BlockQuote extends SlateElement {
  type: "blockquote";
}

const Element = ({ attributes, children }) => {
  return <blockquote {...attributes}>{children}</blockquote>;
};

register({
  slateType: "blockquote",

  fromSlate: ({ children }) => mark_block(children, ">"),

  Element,
  StaticElement: Element,

  toSlate: ({ type, children }) => {
    return { type, children };
  },

  rules: {
    autoFocus: true,
    autoAdvance: false,
  },
});
