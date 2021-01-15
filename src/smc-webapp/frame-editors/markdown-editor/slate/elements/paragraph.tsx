/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps } from "slate-react";
import { register } from "../register";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.tight) {
    return <span {...attributes}>{children}</span>;
  }
  return <p {...attributes}>{children}</p>;
};

register({
  slateType: "paragraph",
  Element,
  toSlate: ({ token, children }) => {
    // We include a tight property when hidden is true, since that's the
    // hack that markdown-it uses for parsing tight lights.
    return {
      ...{ type: "paragraph", children },
      ...(token.hidden ? { tight: true } : {}),
    };
  },
  fromSlate: ({ node, children }) => `${children}${node.tight ? "\n" : "\n\n"}`,
});
