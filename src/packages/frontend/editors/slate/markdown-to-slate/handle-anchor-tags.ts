/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is very similar to handle-open and handle-close for handling
// big block opening and closing tokens.  However, it's just for the
// special case of html anchor tags.

import { register } from "./register";
import { Descendant } from "slate";
import { State } from "./types";
import { getMarkdownToSlate } from "../elements/register";
import { parse } from "./parse";
import stringify from "json-stable-stringify";
import $ from "cheerio";

// handling open anchor tag
register(({ token, state }) => {
  if (state.anchor != null) return; // already handling an anchor tag
  if (
    token.type != "html_inline" ||
    !token.content.toLowerCase().trim().startsWith("<a")
  ) {
    // definitely not an anchor tag
    return;
  }

  // starting an anchor tag
  state.contents = [];
  state.anchor = token;
  const x = $(token.content);
  state.attrs = [];
  for (const attr of ["href", "title"]) {
    const val = x.attr(attr);
    if (val != null) {
      state.attrs.push([attr, val]);
    }
  }
  state.nesting = 0;
  return [];
});

const type = "link";

// handle gathering everything between anchor tags and
// processing result when we hit a closing anchor tag.
register(({ token, state, cache }) => {
  if (state.anchor == null) return; // not currently handling an anchor tag
  if (state.contents == null) {
    throw Error("bug -- state.contents must not be null");
  }

  if (token.type == "html_inline") {
    const x = token.content.toLowerCase().trim();
    if (x.startsWith("<a")) {
      // nesting
      state.nesting += 1;
    } else if (x == "</a>") {
      if (state.nesting > 0) {
        state.nesting -= 1;
      } else {
        // Not nested, so done: parse the accumulated array of children
        // using a new state:
        const child_state: State = {
          nesting: 0,
          marks: state.marks,
          lines: state.lines,
        };
        const children: Descendant[] = [];
        let markdown = "";
        for (const token2 of state.contents) {
          for (const node of parse(token2, child_state, cache)) {
            children.push(node);
          }
          markdown += child_state.markdown ?? "";
        }
        // children array must start and end
        // with text, or markdown caching won't work.
        if (children[children.length - 1]?.["text"] == null) {
          children.push({ text: "" });
        }
        if (children[0]?.["text"] == null) {
          children.unshift({ text: "" });
        }
        const markdownToSlate = getMarkdownToSlate(type);
        const node = markdownToSlate({
          type,
          children,
          state,
          cache,
        });
        if (node == null) {
          // this won't happen, but it's for typescript
          return [];
        }
        if (cache != null && markdown) {
          cache[stringify(node)] = markdown;
        }

        delete state.contents;
        delete state.anchor;
        delete state.attrs;
        return [node];
      }
    }
  }

  // currently gathering between anchor tags:
  state.contents.push(token);
  return []; // we handled this token.
});
