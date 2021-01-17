/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { mark_block } from "../util";
import { register } from "./register";

register({
  slateType: "blockquote",

  fromSlate: ({ children }) => mark_block(children, ">"),

  Element: ({ attributes, children }) => {
    return <blockquote {...attributes}>{children}</blockquote>;
  },

  toSlate: ({ type, children }) => {
    return { type, children };
  },
});
