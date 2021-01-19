/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Descendant } from "slate";
import { register } from "./register";
import { parse } from "./parse";
import { State } from "./types";

function handleChildren({ token, state }) {
  if (!token.children) return;
  // Parse all the children with own state, partly inherited
  // from us (e.g., the text marks).
  const child_state: State = { marks: { ...state.marks }, nesting: 0 };
  const children: Descendant[] = [];
  for (const token2 of token.children) {
    for (const node of parse(token2, child_state)) {
      children.push(node);
    }
  }
  return children;
}

register(handleChildren);
