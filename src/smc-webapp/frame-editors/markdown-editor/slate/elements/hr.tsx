/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps, useFocused, useSelected } from "slate-react";
import { FOCUSED_COLOR } from "../util";
import { Node } from "slate";
import { Token } from "../markdown-to-slate";
import { register } from "../register";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
}) => {
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

function toSlate(_token: Token): Node {
  return { type: "hr", isVoid: true, children: [{ text: "" }] };
}

function fromSlate(_node: Node): string {
  return "\n---\n\n";
}

register({
  slateType: "hr",
  Element,
  toSlate,
  fromSlate,
});
