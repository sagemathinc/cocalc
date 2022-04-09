/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { FOCUSED_COLOR } from "../../util";
import { register } from "../register";
import { useFocused, useSelected } from "../hooks";

register({
  slateType: "hr",

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
              focused && selected ? FOCUSED_COLOR : "transparent"
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
