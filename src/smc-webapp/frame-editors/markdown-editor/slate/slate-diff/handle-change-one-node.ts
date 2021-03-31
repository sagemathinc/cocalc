/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { isEqual } from "lodash";
import { copy_without } from "smc-util/misc";
import { Node, Operation } from "slate";
import { slateDiff } from "./diff";

// Replace node at path by nextNode using the first
// strategy that works.
export function handleChangeOneNode(
  node: Node,
  nextNode: Node,
  path: number[]
): Operation[] {
  for (const strategy of STRATEGIES) {
    const ops = strategy(node, nextNode, path);
    if (ops != null) {
      return ops;
    }
  }
  throw Error("BUG");
}

// We try each of the Handler functions listed below until one of them
// matches.  When one does, that is used to compute the operations.  At
// least one will, since the last one is a fallback that works for any
// input.

type Handler = (
  node: Node,
  nextNode: Node,
  path: number[]
) => Operation[] | undefined;

const STRATEGIES: Handler[] = [];

/*
Common special case -- only the children change:

If we have two blocks and only the children change,
we recursively call our top level diff algorithm on
those children. */
STRATEGIES.push((node, nextNode, path) => {
  if (
    node["children"] != null &&
    nextNode["children"] != null &&
    isEqual(
      copy_without(node, ["children"]),
      copy_without(nextNode, ["children"])
    )
  ) {
    return slateDiff(node["children"], nextNode["children"], path);
  }
});

/* Common special case -- only the value property changes:

A common special case is that one (or more) properties changes, e.g.,
when editing a fenced code block, checkbox, etc., the value
property changes but nothing else does.  Using set_node we can
deal with anything changing except children/text.
*/
STRATEGIES.push((node, nextNode, path) => {
  const properties: any = {};
  const newProperties: any = {};
  for (const key in node) {
    if (!isEqual(node[key], nextNode[key])) {
      if (key == "children" || key == "text") return; // can't do via set_node
      properties[key] = node[key];
      newProperties[key] = nextNode[key];
    }
  }
  for (const key in nextNode) {
    if (node[key] == undefined) {
      if (key == "children" || key == "text") return; // can't do via set_node
      newProperties[key] = nextNode[key];
    }
  }
  // set_node can change everything except the children and text fields.
  return [
    {
      type: "set_node",
      path,
      properties,
      newProperties,
    },
  ];
});

// TODO: we could combine the above two, where children changes *and* any
// property changes (except text).
// I can't think of any case where that actually happens though.

/*
Generic fallback strategy if nothing else works:

Just remove and set, since that's the only thing to do generically.
We want to avoid this as much as possible, since it is not efficient
and breaks the cursor selection!  This will always work though.
*/
// IMPORTANT: this must be added last!
STRATEGIES.push((node, nextNode, path) => {
  return [
    {
      type: "remove_node",
      path,
      node,
    },
    {
      type: "insert_node",
      path,
      node: nextNode,
    },
  ];
});
