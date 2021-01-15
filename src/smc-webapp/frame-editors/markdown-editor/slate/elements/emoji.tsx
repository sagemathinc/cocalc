/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps, useFocused, useSelected } from "slate-react";
import { FOCUSED_COLOR } from "../util";
import { register } from "../register";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const focused = useFocused();
  const selected = useSelected();

  const border =
    focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid white`;

  return (
    <span {...attributes} style={{ border }}>
      {element.content}
      {children}
    </span>
  );
};

register({
  slateType: "emoji",
  Element,
  toSlate: ({ token }) => {
    return {
      type: "emoji",
      isVoid: true,
      isInline: true,
      content: token.content,
      children: [{ text: " " }],
      markup: token.markup,
    };
  },
  fromSlate: ({ node }) => `:${node.markup}:`,
});
