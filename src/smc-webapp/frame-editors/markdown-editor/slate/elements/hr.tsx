/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { FOCUSED_COLOR } from "../util";
import { register, SlateElement, useFocused, useSelected } from "./register";

export interface HR extends SlateElement {
  type: "hr";
}

register({
  slateType: "hr",

  toSlate: ({ children }) => {
    return { type: "hr", isVoid: true, children };
  },

  Element: ({ attributes, children }) => {
    const focused = useFocused();
    const selected = useSelected();

    // See https://css-tricks.com/examples/hrs/ for the cool style...
    return (
      <div {...attributes}>
        <hr
          contentEditable={false}
          style={{
            border: focused && selected ? `1px solid ${FOCUSED_COLOR}` : 0,
            height: "3px",
            background: "#333",
            backgroundImage: "linear-gradient(to right, #ccc, #333, #ccc)",
          }}
        />
        {children}
      </div>
    );
  },

  fromSlate: () => "\n---\n\n",
});
