/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node, Text } from "slate";
import { markdown_it } from "../../../markdown";
import {
  capitalize,
  dict,
  endswith,
  replace_all,
  startswith,
} from "smc-util/misc";
import { math_escape, math_unescape } from "smc-util/markdown-utils";
import { remove_math, MATH_ESCAPE } from "smc-util/mathjax-utils";

function replace_math(text, math) {
  // Replace all the math group placeholders in the text
  // with the saved strings.
  return text.replace(/`\uFE32\uFE33(\d+)\uFE32\uFE33`/g, function (_, n) {
    return math[n];
  });
}

interface Token {
  hidden?: boolean; // See https://markdown-it.github.io/markdown-it/#Token.prototype.hidden
  type: string;
  tag?: string;
  attrs?: string[][];
  children?: Token[];
  content: string;
  block?: boolean;
  markup?: string;
  checked?: boolean;
  info?: string;
}

interface Marks {
  italic?: boolean;
  bold?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  sup?: boolean;
  sub?: boolean;
  color?: string;
}

interface State {
  marks: Marks;
  nesting: number;

  open_type?: string;
  close_type?: string;
  contents?: Token[];
  attrs?: string[][];
  block?: boolean;
}

function parse(
  token: Token,
  state: State,
  level: number,
  math: string[]
): Node[] {
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
        // Note a RULE: "Block nodes can only contain other blocks, or inline and text nodes."
        // See https://docs.slatejs.org/concepts/10-normalizing
        // This means that all children nodes here have to be either *inline/text* or they
        // all have to be blocks themselves -- no mixing.  Our markdown parser I think also
        // does this, except for one weird special case which involves hidden:true that is
        // used for tight lists.

        // We use all_tight to make it so if one node is marked tight, then all are.
        // This is useful to better render nested markdown lists.
        let all_tight: boolean = false;
        for (const token2 of state.contents) {
          for (const node of parse(token2, child_state, level + 1, math)) {
            if (node.tight) {
              all_tight = true;
            }
            if (all_tight) {
              node.tight = true;
            }
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
        switch (type) {
          case "heading":
            node.level = parseInt(token.tag?.slice(1) ?? "1");
            break;
          case "table":
          case "thead":
          case "tbody":
          case "th":
          case "td":
          case "tr":
            break;
          default:
            if (token.hidden) {
              node.tight = true;
            }
            if (!state.block) {
              node.isInline = true;
            }
            if (token.tag && token.tag != "p") {
              node.tag = token.tag;
            }
            if (state.attrs != null) {
              const a: any = dict(state.attrs as any);
              if (a.style != null) {
                a.style = string_to_style(a.style as any);
              }
              node.attrs = a;
            }
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
    state.block = token.block;
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

  if (token.content != null) {
    token.content = math_unescape(token.content);
  }
  // console.log("parse", JSON.stringify({ token, state, level, math }));

  // Handle code
  if (token.type == "code_inline" && token.tag == "code") {
    if (token.content == "☐" || token.content == "☑") {
      return [checkbox(token.content)];
    }
    if (
      startswith(token.content, MATH_ESCAPE) &&
      endswith(token.content, MATH_ESCAPE)
    ) {
      // we encode math as escaped code in markdown, since the markdown parser
      // and latex are not compatible, but the markdown process can process code fine..
      return [math_node(token.content, math)];
    }
    // inline code -- important: put anything we thought was math back in.
    return [{ text: replace_math(token.content, math), code: true }];
  }

  if (token.type == "fence" || token.type == "code_block") {
    // fence =block of code with ``` around it, but not indented.
    // Put any math we removed back in unchanged (since the math parsing doesn't
    // know anything about code blocks, and doesn't know to ignore them).
    let value = replace_math(token.content, math);
    // We also remove the last carriage return (right before ```), since it
    // is much easier to do that here...
    value = value.slice(0, value.length - 1);
    return [
      {
        isVoid: true,
        type: "code_block",
        fence: token.type == "fence",
        value,
        info: token.info,
        children: [{ text: "" }],
      },
    ];
  }

  if (token.type == "html_inline") {
    // special cases for underlining, sup, sub, which markdown doesn't have.
    const x = token.content.toLowerCase();
    switch (x) {
      case "<u>":
        state.marks.underline = true;
        return [];
      case "</u>":
        state.marks.underline = false;
        return [];
      case "<sup>":
        state.marks.sup = true;
        return [];
      case "</sup>":
        state.marks.sup = false;
        return [];
      case "<sub>":
        state.marks.sub = true;
        return [];
      case "</sub>":
        state.marks.sub = false;
        return [];
      case "</span>":
        for (const mark in state.marks) {
          if (startswith(mark, "color:")) {
            delete state.marks[mark];
            return [];
          }
          for (const c of ["family", "size"]) {
            if (startswith(mark, `font-${c}:`)) {
              delete state.marks[mark];
              return [];
            }
          }
        }
        break;
    }
    // Colors look like <span style='color:#ff7f50'>:
    if (startswith(x, "<span style='color:")) {
      // delete any other colors -- only one at a time
      for (const mark in state.marks) {
        if (startswith(mark, "color:")) {
          delete state.marks[mark];
        }
      }
      // now set our color
      const c = x.split(":")[1]?.split("'")[0];
      if (c) {
        state.marks["color:" + c] = true;
      }
      return [];
    }

    for (const c of ["family", "size"]) {
      if (startswith(x, `<span style='font-${c}:`)) {
        const n = `<span style='font-${c}:`.length;
        // delete any other fonts -- only one at a time
        for (const mark in state.marks) {
          if (startswith(mark, `font-${c}:`)) {
            delete state.marks[mark];
          }
        }
        // now set our font
        state.marks[`font-${c}:${x.slice(n, x.length - 2)}`] = true;
        return [];
      }
    }
  }

  switch (token.type) {
    case "inline":
      return [mark({ text: token.content }, state.marks)];
    case "html_block":
    case "html_inline":
      // something else
      return [
        {
          isInline: token.type == "html_inline",
          isVoid: true,
          type: token.type,
          html: replace_math(token.content, math),
          children: [{ text: "" }],
        },
      ];
    case "softbreak":
      return [softbreak()];
    case "hardbreak":
      return [hardbreak()];
    case "hr":
      return [{ type: "hr", isVoid: true, children: [{ text: "" }] }];
    case "emoji":
      return [
        {
          type: "emoji",
          isVoid: true,
          isInline: true,
          content: token.content,
          children: [{ text: "" }],
          markup: token.markup,
        },
      ];
    case "checkbox_input":
      return [
        {
          type: "checkbox",
          isVoid: true,
          isInline: true,
          checked: token.checked,
          children: [{ text: "" }],
        },
      ];
    default:
      return [mark({ text: token.content }, state.marks)];
  }
}

function mark(text: Text, marks: Marks): Node {
  if (!text.text) {
    // don't mark empty string
    return text;
  }

  // unescape dollar signs (in markdown we have to escape them so they aren't interpreted as math).
  text.text = replace_all(text.text, "\\$", "$");

  for (const mark in marks) {
    if (marks[mark]) {
      text[mark] = true;
    }
  }
  return text;
}

export function markdown_to_slate(markdown): Node[] {
  const doc: Node[] = [];
  const state: State = { marks: {}, nesting: 0 };
  const obj: any = {};

  let [text, math] = remove_math(
    math_escape(markdown),
    "`" + MATH_ESCAPE,
    MATH_ESCAPE + "`"
  );

  for (const token of markdown_it.parse(text, obj)) {
    for (const node of parse(token, state, 0, math)) {
      doc.push(node);
    }
  }

  if (doc.length == 0) {
    // empty doc isn't allowed; use the simplest doc.
    doc.push({
      type: "paragraph",
      children: [{ text: "" }],
    });
  }

  (window as any).x = {
    last_parse: markdown_it.parse(text, obj),
    parser: (text) => markdown_it.parse(text, {}),
    doc,
  };

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
  return {
    type: "math",
    value,
    isVoid: true,
    isInline: true,
    children: [{ text: "" }],
  };
}

function checkbox(content: "☐" | "☑"): Node {
  return {
    isVoid: true,
    isInline: true,
    type: "checkbox",
    checked: content == "☑",
    children: [{ text: "" }],
  };
}

export function hardbreak() {
  return {
    type: "hardbreak",
    isInline: true,
    isVoid: false,
    children: [{ text: "\n" }],
  };
}

export function softbreak() {
  return {
    type: "softbreak",
    isInline: true,
    isVoid: false,
    children: [{ text: "\n" }],
  };
}
