/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
NOTE: The diff function below is very similar to
some code in editor_jupyter.coffee.
*/

import { Node, Operation } from "slate";
import { dmp } from "smc-util/sync/editor/generic/util";
import { StringCharMapping } from "smc-util/misc";
import { handleChangeOneNode } from "./handle-change-one-node";
import { handleChangeTextNodes, isAllText } from "./handle-change-text-nodes";

// We could instead use
//    import * as stringify from "json-stable-stringify";
// which might sometimes avoid a safe "false positive" (i.e., slightly
// less efficient patch), but is significantly slower.
const stringify = JSON.stringify;

function docToStrings(doc: Node[]): string[] {
  const v: string[] = [];
  for (const node of doc) {
    v.push(stringify(node));
  }
  return v;
}

export function slateDiff(
  doc0: Node[],
  doc1: Node[],
  path: number[] = []
): Operation[] {
  const t0 = path.length == 0 ? new Date().valueOf() : 0;
  const string_mapping = new StringCharMapping();
  const s0 = docToStrings(doc0);
  const s1 = docToStrings(doc1);
  const m0 = string_mapping.to_string(s0);
  const m1 = string_mapping.to_string(s1);
  const diff = dmp.diff_main(m0, m1);
  const operations: Operation[] = [];
  //console.log({ diff, to_string: string_mapping._to_string });

  function letterToNode(x: string): Node {
    const node = JSON.parse(string_mapping._to_string[x]);
    if (node == null) {
      throw Error("letterToNode: bug");
    }
    return node;
  }

  function stringToNodes(s: string): Node[] {
    const nodes: Node[] = [];
    for (const x of s) {
      nodes.push(letterToNode(x));
    }
    return nodes;
  }

  let index = 0;
  let i = 0;
  while (i < diff.length) {
    const chunk = diff[i];
    const op = chunk[0]; // -1 = delete, 0 = leave unchanged, 1 = insert
    const val = chunk[1];
    if (op === 0) {
      // skip over context diff nodes
      index += val.length;
      i += 1;
      continue;
    }
    const nodes = stringToNodes(val);
    if (op === -1) {
      if (i < diff.length - 1 && diff[i + 1][0] == 1) {
        // next one is an insert, so this is really a "replace".
        const nextVal = diff[i + 1][1];
        const nextNodes = stringToNodes(nextVal);
        if (isAllText(nodes) && isAllText(nextNodes)) {
          // Every single node involved is a text node.  This can be done
          // via modifying and splitting and joining.
          for (const op of handleChangeTextNodes(
            nodes,
            nextNodes,
            path.concat([index])
          )) {
            operations.push(op);
          }
          index += nextNodes.length;
          i += 2; // this consumed two entries from the diff array.
          continue;
        }
        while (nodes.length > 0 && nextNodes.length > 0) {
          // replace corresponding node
          for (const op of handleChangeOneNode(
            nodes[0],
            nextNodes[0],
            path.concat([index])
          )) {
            operations.push(op);
          }
          index += 1;
          nodes.shift();
          nextNodes.shift();
        }
        // delete anything left in nodes
        for (const node of nodes) {
          operations.push({
            type: "remove_node",
            path: path.concat([index]),
            node,
          } as Operation);
        }
        // insert anything left in nextNodes
        for (const node of nextNodes) {
          operations.push({
            type: "insert_node",
            path: path.concat([index]),
            node,
          } as Operation);
          index += 1;
        }
        i += 2; // this consumed two entries from the diff array.
        continue;
      } else {
        // Plain delete of some nodes (with no insert immediately after)
        for (const node of nodes) {
          operations.push({
            type: "remove_node",
            path: path.concat([index]),
            node,
          } as Operation);
        }
        i += 1; // consumes only one entry from diff array.
        continue;
      }
    }
    if (op === 1) {
      // insert new nodes.
      for (const node of nodes) {
        operations.push({
          type: "insert_node",
          path: path.concat([index]),
          node,
        });
        index += 1;
      }
      i += 1;
      continue;
    }
    throw Error("BUG");
  }
  if (path.length == 0) {
    console.log("time: slateDiff", new Date().valueOf() - t0, "ms");
  }

  return operations;
}
