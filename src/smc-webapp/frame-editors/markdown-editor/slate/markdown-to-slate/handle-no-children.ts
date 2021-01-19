/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node, Text } from "slate";
import { getMarkdownToSlate } from "../elements";
import { replace_all } from "smc-util/misc";
import { Marks } from "./types";
import { register } from "./register";
import { DEFAULT_CHILDREN } from "../util";

export function handleNoChildren({ token, state }): Node[] {
  if (token.children != null) {
    throw Error(
      `handleNoChildren -- the token must not have children ${JSON.stringify(
        token
      )}`
    );
  }
  // Handle inline code as a leaf node with style
  if (token.type == "code_inline") {
    return [{ text: token.content, code: true }];
  }

  if (token.type == "text" || token.type == "inline") {
    // text
    return [mark({ text: token.content }, state.marks)];
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
