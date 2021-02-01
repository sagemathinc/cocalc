/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
NOTE: It's very important from a performance perspective that the slatejs
tree produced by this code is normalized, as defined here:

    https://docs.slatejs.org/concepts/10-normalizing

... and also as it is carried out in practice. The reason is that any time
normalization results in a change from the source markdown document, then
every single update to the document keeps redoing exactly that extra update!

*/

import { Descendant } from "slate";
import { handlers } from "./register";
import { State, Token } from "./types";
import { parse_markdown } from "./parse-markdown";
import { ensureDocNonempty } from "../padding";
import { createMetaNode } from "../elements/meta";

export function parse(token: Token, state: State): Descendant[] {
  //console.log("parse", JSON.stringify({ token, state }));
  for (const handler of handlers) {
    const nodes: Descendant[] | undefined = handler({ token, state });
    if (nodes != null) {
      //console.log("parse got ", nodes);
      return nodes;
    }
  }

  throw Error(
    `some handler must process every token -- ${JSON.stringify(token)}`
  );
}

export function markdown_to_slate(markdown: string): Descendant[] {
  // Parse the markdown:
  const t0 = new Date().valueOf();
  const { tokens, meta } = parse_markdown(markdown);
  //console.log({ tokens });

  const doc: Descendant[] = [];
  if (meta != null) {
    doc.push(createMetaNode(meta));
  }
  const state: State = { marks: {}, nesting: 0 };
  for (const token of tokens) {
    for (const node of parse(token, state)) {
      doc.push(node);
    }
  }

  ensureDocNonempty(doc);

  console.log("time: markdown_to_slate", new Date().valueOf() - t0, "ms");
  // console.log({ markdown_to_slate: JSON.stringify(doc) });

  return doc;
}
