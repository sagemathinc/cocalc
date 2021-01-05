/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node } from "slate";
import { markdown_it } from "../../../markdown";
import { capitalize, dict, endswith, startswith } from "smc-util/misc";
import { math_escape } from "smc-util/markdown-utils";
import { remove_math } from "smc-util/mathjax-utils"; // from project Jupyter

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

function parse(
  token: Token,
  state: State,
  level: number,
  math: string[]
): Node[] {
  if (token.hidden) {
    // See https://markdown-it.github.io/markdown-it/#Token.prototype.hidden
    return [];
  }

  // Handle code
  if (token.type == "code_inline" && token.tag == "code") {
    if (
      startswith(token.content, MATH_ESCAPE) &&
      endswith(token.content, MATH_ESCAPE)
    ) {
      // we encode math as escaped code in markdown, since the markdown parser
      // and latex are not compatible, but the markdown process can process math fine..
      return [math_node(token.content, math)];
    }
    // inline code
    return [{ text: token.content, code: true }];
  }

  if (token.type == "fence" && token.tag == "code") {
    // block of code
    return [{ type: "code", tag: "code", children: [{ text: token.content }] }];
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
          for (const node of parse(token2, child_state, level + 1, math)) {
            is_empty = false;
            children.push(node);
          }
        }
        if (is_empty) {
          // it is illegal for the children to be empty.
          children.push({ text: "" });
        }
        const i = state.close_type.lastIndexOf("_");
        const type = state.close_type.slice(0, i);
        delete state.close_type;
        delete state.contents;
        const node: Node = { type, children };
        if (token.tag && token.tag != "p") {
          node.tag = token.tag;
        }
        if (state.attrs != null) {
          const a: any = dict(state.attrs as any);
          if (a.style != null) {
            a.style = string_to_style(a.style as any);
          }
          state.attrs = a;
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
      for (const node of parse(token2, child_state, level + 1, math)) {
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
      // something else
      return [
        {
          isVoid: true,
          type: "html_inline",
          children: [{ text: token.content }],
        },
      ];
    case "softbreak":
      return [{ text: "\n" }];
    case "hardbreak": // TODO: I don't know how to represent this in slatejs.
      return [{ text: "\n" }];
    case "hr":
      return [{ type: "hr", isVoid: true, children: [{ text: "" }] }];
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

const MATH_ESCAPE = "\uFE22\uFE23\uFE24\uFE25\uFE26"; // unused unicode

export function markdown_to_slate(markdown): Node[] {
  (window as any).x = { markdown, markdown_it };

  const doc: Node[] = [];
  const state: State = { marks: {}, nesting: 0 };
  const obj: any = {};
  const [text, math] = remove_math(
    math_escape(markdown),
    "`" + MATH_ESCAPE,
    MATH_ESCAPE + "`"
  );

  for (const token of markdown_it.parse(text, obj)) {
    for (const node of parse(token, state, 0, math)) {
      doc.push(node);
    }
  }
  (window as any).x.doc = doc;
  (window as any).x.math = math;
  (window as any).x.text = text;
  console.log("markdown_to_slate", (window as any).x);

  return doc;
}

function string_to_style(style: string): any {
  const obj: any = {};
  for (const x of style.split(";")) {
    const j = x.indexOf("=");
    if (j == -1) continue;
    let key = x.slice(0, j);
    const i = key.indexOf("-");
    if (i != -1) {
      key = x.slice(0, i) + capitalize(x.slice(i + 1));
    }
    obj[key] = x.slice(j + 1);
  }
  return obj;
}

function math_node(content: string, math: string[]): Node {
  const i = MATH_ESCAPE.length;
  const n = parseInt(content.slice(i, content.length - i));
  const value = math[n] ?? "?"; // if not defined (so ?) there is a bug in the parser...
  return { type: "math", value, isVoid: true, children: [{ text: value }] };
}
