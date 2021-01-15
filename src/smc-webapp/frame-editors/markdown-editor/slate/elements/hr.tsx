/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps, useFocused, useSelected } from "slate-react";
import { FOCUSED_COLOR } from "../util";
import { register } from "../register";

const Element: React.FC<RenderElementProps> = ({ attributes, children }) => {
  const focused = useFocused();
  const selected = useSelected();

  // See https://css-tricks.com/examples/hrs/ for the cool style...
  return (
    <div {...attributes}>
      <hr
        style={{
          border: focused && selected ? `1px solid ${FOCUSED_COLOR}` : 0,
          height: "1px",
          background: "#333",
          backgroundImage: "linear-gradient(to right, #ccc, #333, #ccc)",
        }}
      />
      {children}
    </div>
  );
};

register({
  slateType: "hr",
  Element,
  toSlate: ({ children }) => {
    return { type: "hr", isVoid: true, children };
  },
  fromSlate: () => "\n---\n\n",
});
