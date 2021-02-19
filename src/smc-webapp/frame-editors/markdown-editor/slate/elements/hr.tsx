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

    // The borderTop on the hr is just "fighting back" against a dumb thing
    // that is imposed by bootstrap3... (it's in scaffolding.less).  Someday
    // we'll get rid of bootstrap css entirely!
    return (
      <div {...attributes}>
        <div
          contentEditable={false}
          style={{
            border: `2px solid ${
              focused && selected ? FOCUSED_COLOR : "white"
            }`,
          }}
        >
          <hr style={{ borderTop: "1px solid #aaa" }} />
        </div>
        {children}
      </div>
    );
  },

  fromSlate: () => "---\n\n",
});
