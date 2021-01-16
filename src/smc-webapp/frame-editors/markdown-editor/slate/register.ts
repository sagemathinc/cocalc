/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../app-framework";
import { RenderElementProps } from "slate-react";
import { Node } from "slate";
import { Token, State as MarkdownParserState } from "./markdown-to-slate";
import { Info } from "./slate-to-markdown";

export interface markdownToSlateOptions {
  type: string;
  token: Token;
  state: MarkdownParserState;
  level: number;
  math: string[];
  children: Node[];
  isEmpty: boolean;
}

export interface slateToMarkdownOptions {
  node: Node;
  children: string;
  info: Info;
  child_info: Info;
}

type markdownToSlateFunction = (markdownToSlateOptions) => Node | undefined;

type slateToMarkdownFunction = (slateToMarkdownOptions) => string;

interface Handler {
  slateType: string;
  Element: React.FC<RenderElementProps>;
  // markdownType is the optional type of the markdown token
  // if different than slateType; use an array if there are
  // multiple distinct types of markdown tokens to handle
  // with the same plugin.
  markdownType?: string | string[];
  toSlate: markdownToSlateFunction;
  fromSlate: slateToMarkdownFunction;
}

const renderer: { [slateType: string]: React.FC<RenderElementProps> } = {};
const markdownToSlate: {
  [tokenType: string]: markdownToSlateFunction;
} = {};
const slateToMarkdown: {
  [slateType: string]: slateToMarkdownFunction;
} = {};

export function register(h: Handler): void {
  if (renderer[h.slateType] != null) {
    throw Error(`render for slateType '${h.slateType}' already registered!`);
  }
  renderer[h.slateType] = h.Element;

  const x = h.markdownType ?? h.slateType;
  const types = typeof x == "string" ? [x] : x;
  for (const type of types) {
    if (markdownToSlate[type] != null) {
      throw Error(`markdownToSlate for type '${type}' already registered!`);
    }
    markdownToSlate[type] = h.toSlate;
  }

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
): markdownToSlateFunction | undefined {
  return markdownToSlate[tokenType];
}

export function getSlateToMarkdown(
  slateType: string
): slateToMarkdownFunction | undefined {
  return slateToMarkdown[slateType];
}

// Now import all the element plugins:
import "./elements";
