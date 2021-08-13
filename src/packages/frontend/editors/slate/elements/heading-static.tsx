/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { register, SlateElement } from "./register";


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
    return React.createElement(`h${level}`, attributes, children);
  },
});
