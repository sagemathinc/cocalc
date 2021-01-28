/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
NOTE: The diff function below is very similar to
some code in editor_jupyter.coffee.
*/

import { isEqual } from "lodash";
import { Node, Operation, Text } from "slate";
import { dmp } from "smc-util/sync/editor/generic/util";
import { copy_without, StringCharMapping } from "smc-util/misc";
import { slateTextDiff, isAllText, splitTextNodes } from "./text";

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
  const t0 = new Date().valueOf();
  const string_mapping = new StringCharMapping();
  const s0 = docToStrings(doc0);
  const s1 = docToStrings(doc1);
  const m0 = string_mapping.to_string(s0);
  const m1 = string_mapping.to_string(s1);
  const diff = dmp.diff_main(m0, m1);
  const operations: Operation[] = [];
  //console.log({ m0, m1, diff, to_string: string_mapping._to_string });

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
        Replace one or more nodes, which is expressed as "delete and insert" one letter in dmp's diffs. A
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
          } else if (a?.text != null && b.text != null) {
            // changing a text node
            // First, change any modified properties
            const properties = copy_without(a, "text");
            const newProperties = copy_without(b, "text");
            if (!isEqual(properties, newProperties)) {
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
            }
            if (a.text.trim() == b.text.trim()) {
              // Text itself is the same, so nothing further to do.
              // NOTE regarding the trim -- for something like
              //   {text: "a "} |--> {text: "a"}
              // we do NOT make this change, since it happens naturally when
              // typing a sentence and making the change would delete whitespace
              // as you type.
            } else {
              // actual text changed.
              // Slatejs operations allow us to insert and remove text from node b,
              // but do NOT allow us to simply replace the text.  That's kind of
              // annoying.  Fortunately, this is exactly the sort of thing that
              // diff-match-patch is built for, so we use it again, but now specifically
              // for this text inside this text node.  This isn't that annoying, since
              // we can do this way better using diff-match-patch than slatejs could
              // possibly do without depending on diff-match-patch!  Also, imagine editing
              // a single large text node collaboratively; of course we have to very carefully
              // merge in changes, rather than setting the whole thing.
              for (const op of slateTextDiff(a.text, b.text)) {
                // TODO: maybe path has to be changed if there are multiple OPS?
                operations.push({
                  ...{
                    path: path.concat([index]),
                  } /* since path to text not known to slateTextDiff */,
                  ...op,
                });
              }
            }
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
            //console.log("diff: generic node swap", a, " |--> ", b);
            // For now, we just remove and set, since that's the only
            // thing to do generically.
            // TODO: as much as possible figure out how to do this via mutation.
            // deleting and adding breaks Point.transform if the selection intersects with
            // the deleted node.
            operations.push({
              type: "remove_node",
              path: path.concat([index]),
              replace_path: path.concat([index]),
              node: a,
            } as Operation);
            operations.push({
              type: "insert_node",
              path: path.concat([index]),
              node: b,
            });
          }
          index += 1;
        }
        i += 1; // skip over next chunk -- (since we turned remove/add into "set/mutate").
      } else if (
        val.length == 1 &&
        i < diff.length - 1 &&
        diff[i + 1][0] === 1 &&
        diff[i + 1][1].length > val.length
      ) {
        /* Possibly splitting one node:
           {"text":"A **B** C"} ->
               {"text":"A "} {"text":"B","bold":true} {"text":" C"}
        */
        // We'll implement only this sort of text case first.
        const before_node = doc0[index];
        const after_nodes: any[] = [];
        for (const x of diff[i + 1][1]) {
          after_nodes.push(JSON.parse(string_mapping._to_string[x]));
        }
        if (Text.isText(before_node) && isAllText(after_nodes)) {
          for (const op of splitTextNodes(
            before_node,
            after_nodes,
            path.concat([index])
          )) {
            operations.push(op);
          }
          i += after_nodes.length;
          index += after_nodes.length;  // TODO: is this right or should it be 1.
        } else {
          // Fallback -- delete node(s)
          for (let j = 0; j < val.length; j++) {
            operations.push({
              type: "remove_node",
              path: path.concat([index]),
              node: doc0[index],
            });
          }
        }
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
