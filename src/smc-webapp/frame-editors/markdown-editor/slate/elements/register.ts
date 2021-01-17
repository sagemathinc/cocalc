/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps } from "slate-react";
import { Node } from "slate";
import { State as MarkdownParserState, Token } from "../markdown-to-slate";
import { Info } from "../slate-to-markdown";
import { ChildInfo } from "../element-to-markdown";

export interface markdownToSlateOptions {
  type: string;
  token: Token;
  state: MarkdownParserState;
  children: Node[];
  isEmpty: boolean;
}

export interface slateToMarkdownOptions {
  node: Node;
  children: string;
  info: Info;
  childInfo: ChildInfo;
}

type markdownToSlateFunction = (markdownToSlateOptions) => Node | undefined;

type slateToMarkdownFunction = (slateToMarkdownOptions) => string;

// This hook is called before the children of the node are serialized.
// Use this to mutate childInfo and add in extra information that the
// parent can deduce, but the children can't, since they have no way
// to get at the parent.
type childInfoHookFunction = (opts: {
  node: Node;
  childInfo: ChildInfo;
}) => void;

interface Handler {
  // if array, register handlers for each entry
  slateType: string | string[];

  // markdownType is the optional type of the markdown token
  // if different than slateType; use an array if there are
  // multiple distinct types of markdown tokens to handle
  // with the same plugin.
  markdownType?: string | string[];
  toSlate: markdownToSlateFunction;

  Element: React.FC<RenderElementProps>;

  childInfoHook?: childInfoHookFunction;
  fromSlate: slateToMarkdownFunction;
}

const renderer: { [slateType: string]: React.FC<RenderElementProps> } = {};
const markdownToSlate: {
  [tokenType: string]: markdownToSlateFunction;
} = {};
const slateToMarkdown: {
  [slateType: string]: slateToMarkdownFunction;
} = {};
const childInfoHooks: { [slateType: string]: childInfoHookFunction } = {};

export function register(h: Handler): void {
  const t = typeof h.slateType == "string" ? [h.slateType] : h.slateType;
  for (const slateType of t) {
    if (renderer[slateType] != null) {
      throw Error(`render for slateType '${slateType}' already registered!`);
    }
    renderer[slateType] = h.Element;

    const x = h.markdownType ?? slateType;
    const types = typeof x == "string" ? [x] : x;
    for (const type of types) {
      if (markdownToSlate[type] != null) {
        throw Error(`markdownToSlate for type '${type}' already registered!`);
      }
      markdownToSlate[type] = h.toSlate;
    }

    if (slateToMarkdown[slateType] != null) {
      throw Error(
        `slateToMarkdown for type '${slateType}' already registered!`
      );
    }
    slateToMarkdown[slateType] = h.fromSlate;

    if (h.childInfoHook != null) {
      childInfoHooks[slateType] = h.childInfoHook;
    }
  }
}

export function getRender(slateType: string): React.FC<RenderElementProps> {
  if (renderer[slateType] == null) {
    createGenericPlugin(slateType);
    if (renderer[slateType] == null) {
      throw Error("getRender -- bug creating generic element plugin");
    }
  }
  return renderer[slateType];
}

export function getMarkdownToSlate(tokenType: string): markdownToSlateFunction {
  if (markdownToSlate[tokenType] == null) {
    createGenericPlugin(tokenType);
    if (markdownToSlate[tokenType] == null) {
      throw Error("getMarkdownToSlate -- bug creating generic element plugin");
    }
  }
  return markdownToSlate[tokenType];
}

export function getSlateToMarkdown(slateType: string): slateToMarkdownFunction {
  if (slateToMarkdown[slateType] == null) {
    createGenericPlugin(slateType);
    if (slateToMarkdown[slateType] == null) {
      throw Error("getSlateToMarkdown -- bug creating generic element plugin");
    }
  }
  return slateToMarkdown[slateType];
}

export function getChildInfoHook(
  slateType: string
): childInfoHookFunction | undefined {
  return childInfoHooks[slateType];
}

// Create a generic plugin for the given type since it was
// requested, but wasn't defined.
function createGenericPlugin(type: string) {
  console.log("TODO: createGenericPlugin", { type });
  renderer[type] = renderer[""];
  markdownToSlate[type] = markdownToSlate[""];
  slateToMarkdown[type] = slateToMarkdown[""];
  if (
    renderer[type] == null ||
    markdownToSlate[type] == null ||
    slateToMarkdown[type] == null
  ) {
    throw Error("no generic plugin -- define generic plugin with type ''");
  }
}
