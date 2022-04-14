/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { RenderElementProps } from "../slate-react";
export type { RenderElementProps } from "../slate-react";
import React from "react";
import { Descendant, Element } from "slate";
import { State as MarkdownParserState, Token } from "../markdown-to-slate";
import { Info } from "../slate-to-markdown";
import { ChildInfo } from "../element-to-markdown";

export interface SlateElement {
  children: Descendant[];
}

export interface markdownToSlateOptions {
  type: string;
  token: Token;
  state: MarkdownParserState;
  children: Node[];
  isEmpty: boolean;
  markdown?: string;
}

export interface slateToMarkdownOptions {
  node: Node;
  children: string;
  info: Info;
  childInfo: ChildInfo;
  cache?;
}

type markdownToSlateFunction = (markdownToSlateOptions) => Element | undefined;

type slateToMarkdownFunction = (slateToMarkdownOptions) => string;

interface SizeEstimatorOptions {
  node: Node;
  fontSize: number; // unit of pixels
}

type sizeEstimatorFunction = (SizeEstimatorOptions) => number | undefined;

// This hook is called before the children of the node are serialized.
// Use this to mutate childInfo and add in extra information that the
// parent can deduce, but the children can't, since they have no way
// to get at the parent.
type childInfoHookFunction = (opts: {
  node: Element;
  childInfo: ChildInfo;
}) => void;

// Rules of behavior for slate specific slate types.  This is used for
// autoformat, e.g., type ```[space] and get a codemirror fenced code block editor.
interface Rules {
  // autoFocus: if true, block element gets focused on creation in some cases.
  autoFocus?: boolean;
  // autoAdvance: in next render loop, move cursor forward
  autoAdvance?: boolean;
}

interface Handler {
  // if array, register handlers for each entry
  slateType: string | string[];

  // markdownType is the optional type of the markdown token
  // if different than slateType; use an array if there are
  // multiple distinct types of markdown tokens to handle
  // with the same plugin.
  markdownType?: string | string[];
  toSlate?: markdownToSlateFunction;

  StaticElement?: React.FC<RenderElementProps>;

  Element?: React.FC<RenderElementProps>;

  sizeEstimator?: sizeEstimatorFunction;

  childInfoHook?: childInfoHookFunction;
  fromSlate?: slateToMarkdownFunction;

  rules?: Rules;
}

const renderer: { [slateType: string]: React.FC<RenderElementProps> } = {};
const staticRenderer: { [slateType: string]: React.FC<RenderElementProps> } =
  {};
const markdownToSlate: {
  [tokenType: string]: markdownToSlateFunction;
} = {};
const slateToMarkdown: {
  [slateType: string]: slateToMarkdownFunction;
} = {};
const childInfoHooks: { [slateType: string]: childInfoHookFunction } = {};
const rules: { [slateType: string]: Rules } = {};
const sizeEstimators: {
  [slateType: string]: sizeEstimatorFunction;
} = {};

export function register(h: Handler): void {
  const t = typeof h.slateType == "string" ? [h.slateType] : h.slateType;
  for (const slateType of t) {
    if (h.Element != null) {
      renderer[slateType] = h.Element;
    }

    if (h.StaticElement != null) {
      staticRenderer[slateType] = h.StaticElement;
    }

    if (h.rules != null) {
      rules[slateType] = h.rules;
    }

    const x = h.markdownType ?? slateType;
    const types = typeof x == "string" ? [x] : x;
    if (h.toSlate != null) {
      for (const type of types) {
        markdownToSlate[type] = h.toSlate;
      }
    }

    if (h.fromSlate != null) {
      slateToMarkdown[slateType] = h.fromSlate;
    }

    if (h.childInfoHook != null) {
      childInfoHooks[slateType] = h.childInfoHook;
    }

    if (h.sizeEstimator != null) {
      sizeEstimators[slateType] = h.sizeEstimator;
    }
  }
}

export function getRender(slateType: string): React.FC<RenderElementProps> {
  if (renderer[slateType] == null) {
    if (staticRenderer[slateType] != null) {
      return staticRenderer[slateType];
    }
    console.log(
      `WARNING -- getRender: using generic plugin for type '${slateType}'; this is NOT likely to work.`
    );
    return renderer["generic"];
  }
  return renderer[slateType];
}

interface StaticRenderElementProps extends RenderElementProps {
  setElement?: (obj: any) => void;
}

export function getStaticRender(
  slateType: string
): React.FC<StaticRenderElementProps> {
  //console.log("getStaticRender", slateType);
  if (staticRenderer[slateType] == null) {
    console.log(
      `WARNING -- getStaticRender: using generic plugin for type '${slateType}'; this is NOT likely to work.`
    );
    return renderer["generic"];
  }
  return staticRenderer[slateType];
}

export function getMarkdownToSlate(
  tokenType: string = ""
): markdownToSlateFunction {
  if (markdownToSlate[tokenType] == null) {
    console.log(
      `getMarkdownToSlate: using generic plugin for type '${tokenType}'`
    );
    return markdownToSlate["generic"];
  }
  return markdownToSlate[tokenType];
}

export function getSlateToMarkdown(
  slateType: string = ""
): slateToMarkdownFunction {
  if (slateToMarkdown[slateType] == null) {
    console.log(
      `getSlateToMarkdown: using generic plugin for type '${slateType}'`
    );
    return slateToMarkdown["generic"];
  }
  return slateToMarkdown[slateType];
}

export function getChildInfoHook(
  slateType: string
): childInfoHookFunction | undefined {
  return childInfoHooks[slateType];
}

export function getRules(slateType: string): Rules | undefined {
  return rules[slateType];
}

export function estimateSize(opts: SizeEstimatorOptions): number | undefined {
  const estimate = sizeEstimators[opts.node["type"]]?.(opts);
  // console.log(estimate, " -- estimated size of ", opts);
  return estimate;
}
