/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Descendant } from "slate";
import { handlers } from "./register";
import { State, Token } from "./types";
import { parse_markdown } from "./parse-markdown";
import { ensureDocNonempty } from "../padding";
import { createMetaNode } from "../elements/meta/type";
import stringify from "json-stable-stringify";
import normalize from "./normalize";
import getSource from "./source";

export function parse(token: Token, state: State, cache?): Descendant[] {
  // console.log("parse", JSON.stringify({ token, state }));
  for (const handler of handlers) {
    const nodes: Descendant[] | undefined = handler({ token, state, cache });
    if (nodes != null) {
      // console.log("parse got ", JSON.stringify(nodes));
      return nodes;
    }
  }

  throw Error(
    `some handler must process every token -- ${JSON.stringify(token)}`
  );
}

export function markdown_to_slate(
  markdown: string,
  no_meta?: boolean,
  cache?
): Descendant[] {
  // Parse the markdown:
  // const t0 = new Date().valueOf();
  const { tokens, meta, lines } = parse_markdown(markdown, no_meta);
  // window.tokens = tokens;

  const doc: Descendant[] = [];
  if (meta != null) {
    doc.push(createMetaNode(meta));
  }
  const state: State = { marks: {}, nesting: 0, lines };
  for (const token of tokens) {
    for (const node of parse(token, state, cache)) {
      if (cache != null && token.level === 0 && token.map != null) {
        // cache here when token is only one (e.g., fenced code block),
        // and cache in handle-close when parsing a block.
        cache[stringify(node)] = getSource(token, lines);
      }
      doc.push(node);
    }
  }

  ensureDocNonempty(doc);

  /*
  Why normalize?  It's critial that the slatejs
  tree produced by this code is normalized, as defined here:

      https://docs.slatejs.org/concepts/10-normalizing

  ... and also as it is carried out in practice with our normalization plugins
  that are in ../normalize.ts.

  The reason is that any time normalization results in a change from the
  source markdown document, then every single update to the document
  keeps redoing exactly that extra update! This leads to extensive problems.
  If you suspect this, enable EXPENSIVE_DEBUG in ./editable-markdown.tsx
  and edit a document, watching the console.log.

  I've tried to make it so the parser here is always normalized. However,
  there always seem to be really subtle edge cases.  Also, in the long run
  other people working on this code could add normalizations to
  ./normalize.ts and mess up this parser ever so slightly.  So instead,
  we just always normalize.  This isn't too expensive, and is worth it
  to ensure sanity.
  */
  //   console.log(
  //     "time: markdown_to_slate without normalize",
  //     new Date().valueOf() - t0,
  //     "ms"
  //   );
  const ndoc = normalize(doc);

  // console.log("time: markdown_to_slate", new Date().valueOf() - t0, "ms");
  // console.log({ markdown_to_slate: JSON.stringify(doc) });
  return ndoc;
}
