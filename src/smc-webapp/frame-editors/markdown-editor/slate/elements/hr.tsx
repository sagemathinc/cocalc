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
        <div
          contentEditable={false}
          style={{
            border:
              focused && selected
                ? `2px solid ${FOCUSED_COLOR}`
                : "2px solid white",
            height: "13px",
            padding: "2px 10px",
            borderRadius: "5px",
          }}
        >
          <hr
            style={{
              margin: 0,
              height: "3px",
              background: "#333",
              backgroundImage: "linear-gradient(to right, #ccc, #333, #ccc)",
            }}
          />
        </div>
        {children}
      </div>
    );
  },

  fromSlate: () => "---\n\n",
});
