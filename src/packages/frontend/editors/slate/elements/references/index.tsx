/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "../register";
import { References, createReferencesNode } from "./type";
export type { References };
export { createReferencesNode };


register({
  slateType: "references",

  toSlate: ({ token }) => {
    // this doesn't actually happen, since references aren't tokenized,
    // but are parsed out separately in state.
    return createReferencesNode(token.content);
  },

  StaticElement: ({ attributes, element, children }) => {
    if (element.type != "references") throw Error("bug");
    return <div {...attributes}>{children}</div>;
  },
});
