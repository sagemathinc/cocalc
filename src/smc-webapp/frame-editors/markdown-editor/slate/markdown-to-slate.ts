/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node } from "slate";
import { markdown_it } from "../../../markdown";
import { dict, endswith } from "smc-util/misc";

interface Token {
  hidden?: boolean;
  type: string;
  tag?: string;
  attrs?: string[][];
  children?: Token[];
  content: string;
}

interface Marks {
  italic?: boolean;
  bold?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

interface State {
  marks: Marks;
  nesting: number;

  open_type?: string;
  close_type?: string;
  contents?: Token[];
  attrs?: string[][];
}

function parse(token: Token, state: State, level: number = 0): Node[] {
  if (token.hidden) {
    // See https://markdown-it.github.io/markdown-it/#Token.prototype.hidden
    return [];
  }

  if (token.type == "html_inline") {
    switch (token.content.toLowerCase()) {
      case "<u>":
        state.marks.underline = true;
        return [];
      case "</u>":
        state.marks.underline = false;
        return [];
    }
  }

  switch (token.type) {
    case "em_open":
      state.marks.italic = true;
      return [];
    case "strong_open":
      state.marks.bold = true;
      return [];
    case "s_open":
      state.marks.strikethrough = true;
      return [];
    case "em_close":
      state.marks.italic = false;
      return [];
    case "strong_close":
      state.marks.bold = false;
      return [];
    case "s_close":
      state.marks.strikethrough = false;
      return [];
  }

  if (state.close_type) {
    if (state.contents == null) {
      throw Error("bug -- contents must not be null");
    }

    // Currently collecting the contents to parse when we hit the close_type.
    if (token.type == state.open_type) {
      // Hitting same open type *again* (its nested), so increase nesting level.
      state.nesting += 1;
    }

    if (token.type === state.close_type) {
      // Hit the close_type
      if (state.nesting > 0) {
        // We're nested, so just go back one.
        state.nesting -= 1;
      } else {
        // Not nested, so done: parse the accumulated array of children
        // using a new state:
        const child_state: State = { marks: state.marks, nesting: 0 };
        const children: Node[] = [];
        let is_empty = true;
        for (const token2 of state.contents) {
          for (const node of parse(token2, child_state, level + 1)) {
            is_empty = false;
            children.push(node);
          }
        }
        if (is_empty) {
          // it is illegal for the children to be empty (breaks slatejs).
          children.push({ text: "" });
        }
        const i = state.close_type.lastIndexOf("_");
        const type = state.close_type.slice(0, i);
        delete state.close_type;
        delete state.contents;

        const node: Node = { type, tag: token.tag, children };
        if (state.attrs != null) {
          node.attrs = dict(state.attrs as any);
        }
        return [node];
      }
    }

    state.contents.push(token);
    return [];
  }

  if (endswith(token.type, "_open")) {
    // Opening for new array of children.  We start collecting them
    // until hitting a token with close_type.
    state.contents = [];
    const i = token.type.lastIndexOf("_open");
    state.close_type = token.type.slice(0, i) + "_close";
    state.open_type = token.type;
    state.nesting = 0;
    state.attrs = token.attrs;
    return [];
  }

  if (token.children) {
    // Parse all the children with own state.
    const child_state: State = { marks: { ...state.marks }, nesting: 0 };
    const children: Node[] = [];
    for (const token2 of token.children) {
      for (const node of parse(token2, child_state, level + 1)) {
        children.push(node);
      }
    }
    return children;
  }

  // No children and not wrapped in anything:
  switch (token.type) {
    case "inline":
      return [mark({ text: token.content }, state.marks)];
    case "html_inline":
      return [
        {
          type: "html_inline",
          children: [{ text: token.content }],
        },
      ];
    case "softbreak":
      return [{ text: "\n" }];
    case "hardbreak": // TODO: I don't know how to represent this in slatejs.
      return [{ text: "\n" }];
    default:
      return [mark({ text: token.content }, state.marks)];
  }
}

function mark(text: Node, marks: Marks): Node {
  if (!text.text) {
    // don't mark empty string
    return text;
  }
  for (const mark in marks) {
    if (marks[mark]) {
      text[mark] = true;
    }
  }
  return text;
}

export function markdown_to_slate(text): Node[] {
  (window as any).x = { text, markdown_it };

  const doc: Node[] = [];
  const state: State = { marks: {}, nesting: 0 };
  const obj: any = {};
  for (const token of markdown_it.parse(text, obj)) {
    for (const node of parse(token, state)) {
      doc.push(node);
    }
  }
  (window as any).x.doc = doc;
  console.log("markdown_to_slate", (window as any).x);

  return doc;
}
