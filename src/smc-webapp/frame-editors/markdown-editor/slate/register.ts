/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../app-framework";
import { RenderElementProps } from "slate-react";
import { Node } from "slate";
import { Token } from "./markdown-to-slate";

interface Handler {
  slateType: string;
  Element: React.FC<RenderElementProps>;
  markdownType?: string; // type of the markdown token if different than slateType
  toSlate: (token: Token) => Node;
  fromSlate: (node: Node, children: string) => string;
}

const renderer: { [slateType: string]: React.FC<RenderElementProps> } = {};
const markdownToSlate: { [tokenType: string]: (token: Token) => Node } = {};
const slateToMarkdown: {
  [slateType: string]: (node: Node, children: string) => string;
} = {};

export function register(h: Handler): void {
  if (renderer[h.slateType] != null) {
    throw Error(`render for slateType '${h.slateType}' already registered!`);
  }
  renderer[h.slateType] = h.Element;

  const type = h.markdownType ?? h.slateType;
  if (markdownToSlate[type] != null) {
    throw Error(`markdownToSlate for type '${type}' already registered!`);
  }
  markdownToSlate[type] = h.toSlate;

  if (slateToMarkdown[h.slateType] != null) {
    throw Error(
      `slateToMarkdown for type '${h.slateType}' already registered!`
    );
  }
  slateToMarkdown[h.slateType] = h.fromSlate;
}

export function getRender(
  slateType: string
): React.FC<RenderElementProps> | undefined {
  return renderer[slateType];
}

export function getMarkdownToSlate(
  tokenType: string
): ((token: Token) => Node) | undefined {
  return markdownToSlate[tokenType];
}

export function getSlateToMarkdown(
  slateType: string
): ((node: Node, children: string) => string) | undefined {
  return slateToMarkdown[slateType];
}

// Now import all the plugins:
import "./elements";
