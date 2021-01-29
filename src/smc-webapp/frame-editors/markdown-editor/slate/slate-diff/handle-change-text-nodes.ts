/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Operation, Text } from "slate";
import { splitTextNodes } from "./text";
import { copy_without } from "smc-util/misc";
import { isEqual } from "lodash";

// Transform some text nodes into some other text nodes.
export function handleChangeTextNodes(
  nodes: Text[],
  nextNodes: Text[],
  path: number[],
  isLast: boolean
): Operation[] {
  if (nodes.length == 0) throw Error("must have at least one nodes");
  if (nextNodes.length == 0) throw Error("must have at least one nextNodes");

  if (
    isLast &&
    nodes.length == 1 &&
    nextNodes.length == 1 &&
    nodes[0].text.trimRight() == nextNodes[0].text.trimRight() &&
    isEqual(
      copy_without(nodes[0], ["text"]),
      copy_without(nextNodes[0], ["text"])
    )
  ) {
    // NOTE regarding the trim -- for something like
    //   {text: "a "} |--> {text: "a"}
    // we do NOT make any change, since this happens naturally when
    // typing a sentence and making the change would delete whitespace
    // as you type.
    return [];
  }

  const operations: Operation[] = [];
  let node = nodes[0];
  if (nodes.length > 1) {
    // join together everything in nodes first
    for (let i = 1; i < nodes.length; i++) {
      operations.push({
        type: "merge_node",
        path: [...path.slice(0, path.length - 1), path[path.length - 1] + 1],
        position: 0, // make TS happy; seems ignored in source code
        properties: {}, // make TS happy; seems ignored in source code -- probably a typescript error.
      });
      node = { ...node, ...{ text: node.text + nodes[i].text } }; // update text so splitTextNodes can use this below.
    }
  }

  return operations.concat(splitTextNodes(node, nextNodes, path));
}
