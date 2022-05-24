/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register, SlateElement } from "../register";
import { dict } from "@cocalc/util/misc";

export interface Details extends SlateElement {
  type: "details";
  isInline?: boolean;
  open?: boolean;
}

register({
  slateType: "details",

  StaticElement: ({ attributes, children, element }) => {
    const node = element as Details;
    return (
      <details
        {...{ ...attributes, ...{ open: node.open } }}
        style={{ cursor: "pointer" }}
      >
        {children}
      </details>
    );
  },

  toSlate: ({ children, state, token }) => {
    const attrs = dict(state.attrs as any);
    return {
      type: "details",
      children,
      isInline: token.type == "html_inline",
      open: attrs.open,
    };
  },
});
