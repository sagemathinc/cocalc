/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { register, SlateElement } from "../register";

export interface Paragraph extends SlateElement {
  type: "paragraph";
}

register({
  slateType: "paragraph",

  toSlate: ({ token, children, state }) => {
    if (token.hidden) {
      // this is how markdown-it happens to encode the
      // idea of a "tight list"; it wraps the items
      // in a "hidden" paragraph.  Weird and annoying,
      // but I can see why, I guess.  Instead, we just
      // set this here, and it propagates up to the
      // enclosing list.  Whichever tightness is first takes
      // precedence.
      state.tight = true;
    }
    return { type: "paragraph", children } as Paragraph;
  },

  StaticElement: ({ attributes, children, element }) => {
    if (element.type != "paragraph") throw Error("bug");
    // textIndent: 0 is needed due to task lists -- see slate/elements/list/list-item.tsx
    return (
      <p {...attributes}>
        <span style={{ textIndent: 0 }}>{children}</span>
      </p>
    );
  },

  sizeEstimator({ node, fontSize }): number {
    const numLines = Math.round(JSON.stringify(node).length / 60);
    return numLines * 1.4 * fontSize + fontSize;
  },
});
