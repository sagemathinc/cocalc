/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Operation, Text } from "slate";
import { dmp } from "smc-util/sync/editor/generic/util";
import { len } from "smc-util/misc";

export function nextPath(path: number[]): number[] {
  return [...path.slice(0, path.length - 1), path[path.length - 1] + 1];
}

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
  //console.log("slateTextDiff", { a, b, diff, operations });

  return operations;
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
  let splitText = "";
  for (const { text } of split) {
    splitText += text;
  }
  const nodeText = node.text;
  const operations: Operation[] = [];
  if (splitText != nodeText) {
    // Use diff-match-pach to transform the text in the source node to equal
    // the text in the sequence of target nodes.  Once we do this transform,
    // we can then worry about splitting up the resulting source node.
    for (const op of slateTextDiff(nodeText, splitText)) {
      // TODO: maybe path has to be changed if there are multiple OPS?
      operations.push({ ...{ path }, ...op });
    }
  }

  // Set properties on initial text to be those for split[0], if necessary.
  let properties = getProperties(split[0], node);
  if (len(properties) > 0) {
    operations.push({
      type: "set_node",
      path,
      properties: getProperties(node),
      newProperties: properties,
    });
  }

  // Rest of the operations to split up node as required.
  let splitPath = path;
  for (let i = 0; i < split.length - 1; i++) {
    const part = split[i];
    const nextPart = split[i + 1];
    const prevProperties = properties;
    properties = getProperties(nextPart, properties);
    for (const op of splitNode({
      path: splitPath,
      position: part.text.length,
      properties: prevProperties,
      newProperties: properties,
    })) {
      operations.push(op);
    }
    splitPath = nextPath(splitPath);
  }
  return operations;
}

/*
Annoying fact: the set_node api lets you delete properties by setting
them to null, but the split_node api doesn't (I guess Ian forgot to
implement that... or there is a good reason).  So if there are any
property deletes, then we have to also do a set_node.   Maybe the reason
is just to keep the operations simple and minimal...
*/
function splitNode({
  path,
  position,
  properties,
  newProperties,
}: {
  path: number[];
  position: number;
  properties: any;
  newProperties: any;
}): Operation[] {
  const operations: Operation[] = [];
  const deletes: any = {};
  for (const prop in newProperties) {
    if (newProperties[prop] === undefined) {
      deletes[prop] = undefined;
      delete newProperties[prop];
    }
  }

  operations.push({
    type: "split_node",
    path,
    position,
    properties: newProperties,
  });

  if (len(deletes) > 0) {
    operations.push({
      type: "set_node",
      path: nextPath(path),
      properties,
      newProperties: deletes,
    });
  }

  return operations;
}

// Get object that will set the properties of before
// to equal the properties of node, in terms of the
// slatejs set_node operation.
function getProperties(goal: Text, before?: Text): any {
  const props: any = {};
  for (const x in goal) {
    if (x != "text") {
      if (before == null) {
        if (goal[x]) {
          props[x] = goal[x];
        }
        continue;
      } else {
        if (goal[x] !== before[x]) {
          if (goal[x]) {
            props[x] = goal[x];
          } else {
            props[x] = undefined; // remove property...
          }
        }
      }
    }
  }
  if (before != null) {
    // also be sure to explicitly remove props not in goal
    // WARNING: this might change in slatejs; I saw a discussion about this.
    for (const x in before) {
      if (x != "text" && goal[x] == null) {
        props[x] = undefined;
      }
    }
  }
  return props;
}
