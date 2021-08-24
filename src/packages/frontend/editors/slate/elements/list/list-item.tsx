/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { register, SlateElement } from "../register";

export interface ListItem extends SlateElement {
  type: "list_item";
}

register({
  slateType: "list_item",

  toSlate: ({ children }) => {
    return { type: "list_item", children };
  },

  StaticElement: ({ attributes, children }) => {
    return <li {...attributes}>{children}</li>;
  },
});
