/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
TODO:

- [ ] This could very easily be pulled out of cocalc and make a useful
MIT licensed slatejs plugin.  It might be very useful to some people.

- [ ] The diff function below is very similar to some code in
editor_jupyter.coffee.

*/

import { Node, Operation } from "slate";
import { dmp } from "smc-util/sync/editor/generic/util";
import { copy_without, StringCharMapping } from "smc-util/misc";

// We could instead use
//    import * as stringify from "json-stable-stringify";
// which might sometimes avoid a safe "false positive", but
// is significantly slower.
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
  const t0 = new Date().valueOf();
  const string_mapping = new StringCharMapping();
  const s0 = docToStrings(doc0);
  const s1 = docToStrings(doc1);
  const m0 = string_mapping.to_string(s0);
  const m1 = string_mapping.to_string(s1);
  const diff = dmp.diff_main(m0, m1);
  const operations: Operation[] = [];

  let index = 0;
  let i = 0;
  while (i < diff.length) {
    const chunk = diff[i];
    const op = chunk[0]; // -1 = delete, 0 = leave unchanged, 1 = insert
    const val = chunk[1];
    if (op === 0) {
      // skip over nodes
      index += val.length;
    } else if (op === -1) {
      if (
        i < diff.length - 1 &&
        diff[i + 1][0] === 1 &&
        diff[i + 1][1].length === val.length
      ) {
        /*
        Replace node, which is expressed as "insert and delete" in dmp's diffs. A
        common special case arises when one is editing a single node, which gets
        represented in dmp as deleting node, then adding a slightly modified version.
        Replacing is far more efficient than delete and add, and opens up the
        possibility of optimizations involving manipulation (e.g., set_node) later to
        make things more efficient and even work properly when multiple users edit the
        same node at the same time.
        */
        for (const x of diff[i + 1][1]) {
          // This parse should never fail, since we just created all
          // of these JSON strings above; it could only happen
          // due to a shocking browser bug in JSON.stringify!
          const node = JSON.parse(string_mapping._to_string[x]);
          if (node == null) throw Error("bug");

          /* This change has happened:
                a = doc0[index] |---> b = node
             Instead of always just deleting a and creating b, let's try harder.
             If they are the same except children compare their children and instead
             do operations on those.
          */
          const a = doc0[index] as any, // this can be null (I observed it happen)
            b = node as any;
          if (
            /* same except for children */
            a != null &&
            a.children != null &&
            b.children != null &&
            stringify(copy_without(a, "children")) ==
              stringify(copy_without(b, "children"))
          ) {
            // OK, just transform the children instead!
            for (const op of slateDiff(
              a["children"],
              b["children"],
              path.concat([index])
            )) {
              operations.push(op);
            }
          } else if (
            a != null &&
            a.text != null &&
            b.text != null &&
            a.text == b.text
          ) {
            // Two text nodes with same text and different marks; we can transform one
            // to the other.
            const properties = copy_without(a, "text");
            const newProperties = copy_without(b, "text");
            // We also must explicitly remove any properties that got dropped!
            for (const key in properties) {
              if (newProperties[key] === undefined) {
                newProperties[key] = undefined;
              }
            }
            operations.push({
              type: "set_node",
              path: path.concat([index]),
              properties,
              newProperties,
            });
          } else if (
            /* non-Text, same except for a value property, so handle checkboxes, code blocks, etc. */
            a != null &&
            a.children != null &&
            b.children != null &&
            stringify(copy_without(a, "value")) ==
              stringify(copy_without(b, "value"))
          ) {
            operations.push({
              type: "set_node",
              path: path.concat([index]),
              properties: { value: a.value },
              newProperties: { value: b.value },
            });
          } else {
            // For now, we just remove and set, since that's the only
            // thing to do generically.
            operations.push({
              type: "remove_node",
              path: path.concat([index]),
              node: doc0[index],
            });
            operations.push({
              type: "insert_node",
              path: path.concat([index]),
              node,
            });
          }
          index += 1;
        }
        i += 1; // skip over next chunk -- (since we turned remove/add into "set/mutate").
      } else {
        // Deleting node(s)
        for (let j = 0; j < val.length; j++) {
          operations.push({
            type: "remove_node",
            path: path.concat([index]),
            node: doc0[index],
          });
        }
      }
    } else if (op === 1) {
      // Create new node(s)
      for (const x of val) {
        const node = JSON.parse(string_mapping._to_string[x]);
        if (node == null) throw Error("bug");
        operations.push({
          type: "insert_node",
          path: path.concat([index]),
          node,
        });
        index += 1;
      }
    } else {
      throw Error(`BUG -- invalid diff -- ${JSON.stringify(diff)}`);
    }
    i += 1;
  }
  console.log("time: slateDiff", new Date().valueOf() - t0, "ms");

  return operations;
}
