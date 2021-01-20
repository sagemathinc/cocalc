/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Text } from "slate";
import { getMarkdownToSlate } from "../elements";
import { replace_all } from "smc-util/misc";
import { Marks } from "./types";
import { register } from "./register";
import { DEFAULT_CHILDREN } from "../util";
import { CURSOR } from "../leaf-to-markdown";

export function handleNoChildren({ token, state, options }) {
  if (token.children != null) {
    throw Error(
      `handleNoChildren -- the token must not have children ${JSON.stringify(
        token
      )}`
    );
  }
  // Handle inline code as a leaf node with style
  if (token.type == "code_inline") {
    return [createTextNode(token.content, { code: true }, options.cursorRef)];
  }

  if (token.type == "text" || token.type == "inline") {
    // text
    return [createTextNode(token.content, state.marks, options.cursorRef)];
  } else {
    // everything else -- via our element plugin mechanism.
    const markdownToSlate = getMarkdownToSlate(token.type);
    const node = markdownToSlate({
      type: token.type,
      token,
      children: DEFAULT_CHILDREN,
      state,
      isEmpty: false,
    });
    if (node != null) {
      return [node];
    } else {
      // node == undefied/null means that we want no node
      // at all; markdown-it sometimes uses tokens to
      // convey state but nothing that should be included
      // in the slate doc tree.
      return [];
    }
  }
}

register(handleNoChildren);

function createTextNode(
  text: string,
  marks: Marks,
  cursorRef?: { current: { node: Text; offset: number } }
): Text {
  if (!text) {
    // don't mark empty string
    return { text };
  }

  // unescape dollar signs (in markdown we have to escape them so they aren't interpreted as math).
  text = replace_all(text, "\\$", "$");
  const node = { text } as Text;

  for (const mark in marks) {
    if (marks[mark]) {
      node[mark] = true;
    }
  }

  if (cursorRef != null) {
    const offset = text.indexOf(CURSOR);
    if (offset != -1) {
      node.text = text.slice(0, offset) + text.slice(offset + 2); // +2 because utf16
      cursorRef.current = { node, offset };
    }
  }
  return node;
}
