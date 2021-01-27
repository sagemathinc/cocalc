/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Operation, Text } from "slate";
import { dmp } from "smc-util/sync/editor/generic/util";

interface Op {
  type: "insert_text" | "remove_text";
  offset: number;
  text: string;
}

export function slateTextDiff(a: string, b: string): Op[] {
  const diff = dmp.diff_main(a, b);

  const operations: Op[] = [];

  let offset = 0;
  let i = 0;
  while (i < diff.length) {
    const chunk = diff[i];
    const op = chunk[0]; // -1 = delete, 0 = leave unchanged, 1 = insert
    const text = chunk[1];
    if (op === 0) {
      // skip over context, since this diff applies cleanly
      offset += text.length;
    } else if (op === -1) {
      // remove some text.
      operations.push({ type: "remove_text", offset, text });
    } else if (op == 1) {
      // insert some text
      operations.push({ type: "insert_text", offset, text });
      offset += text.length;
    }
    i += 1;
  }
  console.log("slateTextDiff", { a, b, diff, operations });

  return operations;
}

export function isAllText(nodes: any[]): boolean {
  for (const node of nodes) {
    if (!Text.isText(node)) return false;
  }
  return true;
}

/* Accomplish something like this

node={"text":"xyz A **B** C"} ->
               split={"text":"A "} {"text":"B","bold":true} {"text":" C"}

via a combination of remove_text/insert_text as above and split_node
operations.
*/

export function splitTextNodes(
  node: Text,
  split: Text[],
  path: number[] // the path to node.
): Operation[] {
  if (split.length == 0) {
    // easy special case
    return [
      {
        type: "remove_node",
        node,
        path,
      },
    ];
  }
  // First operation: transform the text node to the concatenation of result.
  let split_text = "";
  for (const { text } of split) {
    split_text += text;
  }
  const node_text = node.text;
  const operations: Operation[] = [];
  if (split_text != node_text) {
    for (const op of slateTextDiff(node_text, split_text)) {
      // TODO: maybe path has to be changed if there are multiple OPS?
      operations.push({ ...{ path }, ...op });
    }
  }

  // Set properties on initial text to be those for split[0], if necessary.
  let properties = getProperties(split[0], node);
  if (properties.length > 0) {
    operations.push({
      type: "set_node",
      path,
      properties: getProperties(node),
      newProperties: properties,
    });
  }

  // Rest of the operations to split up node as required.
  // TODO: implement removing properties
  const split_path = [...path];
  let i = 1;
  for (const part of split.slice(0, split.length - 1)) {
    const next_part = split[i];
    properties = getProperties(next_part, properties);
    operations.push({
      type: "split_node",
      path: [...split_path],
      position: part.text.length,
      properties,
    });
    split_path[split_path.length - 1] += 1;
    i += 1;
  }
  return operations;
}

function getProperties(node: Text, before?: Text): any {
  const props: any = {};
  for (const x in node) {
    if (x != "text") {
      if (before == null) {
        props[x] = true;
        continue;
      } else {
        if (node[x] !== before[x]) {
          props[x] = node[x];
        }
      }
    }
  }
  if (before != null) {
    // also be sure to explicitly remove props
    for (const x in before) {
      if (x != "text" && node[x] === undefined) {
        props[x] = undefined;
      }
    }
  }
  return props;
}
