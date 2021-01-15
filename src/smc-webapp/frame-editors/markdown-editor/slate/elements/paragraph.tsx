/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps } from "slate-react";
import { Node } from "slate";
import { Token } from "../markdown-to-slate";
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

function toSlate(token: Token, children: Node[]): Node {
  const node = { type: "paragraph", children } as Node;
  if (token.hidden) {
    node.tight = true;
  }
  return node;
}

function fromSlate(node: Node, children: string): string {
  return `${children}${node.tight ? "\n" : "\n\n"}`;
}

register({
  slateType: "paragraph",
  Element,
  toSlate,
  fromSlate,
});
