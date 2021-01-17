/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node } from "slate";
import { handlers } from "./register";
import { State, Token } from "./types";
import { parse_markdown } from "./parse-markdown";

export function parse(token: Token, state: State): Node[] {
  for (const handler of handlers) {
    const nodes: Node[] | undefined = handler({ token, state });
    if (nodes != null) {
      return nodes;
    }
  }

  throw Error(
    `some handler must process every token -- ${JSON.stringify(token)}`
  );
}

export function markdown_to_slate(markdown: string): Node[] {
  // Parse the markdown:
  const tokens = parse_markdown(markdown);

  const doc: Node[] = [];
  const state: State = { marks: {}, nesting: 0 };
  for (const token of tokens) {
    for (const node of parse(token, state)) {
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
    tokens,
    doc,
  };

  return doc;
}
