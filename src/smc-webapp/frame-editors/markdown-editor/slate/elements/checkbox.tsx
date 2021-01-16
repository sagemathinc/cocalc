/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import {
  RenderElementProps,
  useFocused,
  useSelected,
  useSlate,
} from "slate-react";
import { FOCUSED_COLOR } from "../util";
import { Transforms } from "slate";
import { register } from "../register";
import { Checkbox } from "antd";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const focused = useFocused();
  const selected = useSelected();
  const editor = useSlate();

  const border =
    focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid white`;

  return (
    <span {...attributes}>
      <Checkbox
        style={{
          border,
          padding: "0 0.2em",
          verticalAlign: "middle",
        }}
        checked={!!element.checked}
        onChange={(e) => {
          Transforms.setNodes(
            editor,
            { checked: e.target.checked },
            { match: (node) => node.type == "checkbox" }
          );
        }}
      />
      {children}
    </span>
  );
};

register({
  slateType: "checkbox",
  markdownType: "checkbox_input",

  toSlate: ({ token }) => {
    // NOTE: the checkbox markdown-it plugin that finds the checkboxes in the input
    // markdown is something I also wrote.  It is in smc-webapp/markdown/checkbox-plugin.ts.
    return {
      type: "checkbox",
      isVoid: true,
      isInline: true,
      checked: token.checked,
      children: [{ text: "" }],
    };
  },

  Element,

  fromSlate: ({ node }) => `[${node.checked ? "x" : " "}]`,
});
