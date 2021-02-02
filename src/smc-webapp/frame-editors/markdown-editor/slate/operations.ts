/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Operation, Editor, Transforms } from "slate";

export function applyOperations(editor: Editor, operations: Operation[]): void {
  if (operations.length == 0) return;
  const t0 = new Date().valueOf();
  try {
    (editor as any).applyingOperations = true; // TODO: not sure if this is at all necessary...

    // IMPORTANT: we use transform to apply all but the last operation,
    // then use editor.apply for the very last operation.  Why?
    // Because editor.apply normalize the document and does a bunch of
    // other things which can easily make it so the operations
    // are no longer valid, e.g., their paths are wrong, etc.
    // Obviously, it is also much better to not normalize every single
    // time too.
    for (const op of operations) {
      //console.log("apply ", op);
      Transforms.transform(editor, op);
    }

    // We also apply one **empty** operation which causes the editor to
    // normalize itself and do a bunch of other things, including flushing
    // updates.
    editor.apply({
      type: "set_node",
      path: [0],
      properties: {},
      newProperties: {},
    });

    //console.log("apply last ", operations[operations.length - 1]);
    // editor.apply(operations[operations.length - 1]);
    console.log(
      `time: apply ${operations.length} operations`,
      new Date().valueOf() - t0,
      "ms"
    );
    (window as any).operations = operations;
  } finally {
    (editor as any).applyingOperations = false;
  }
}

/*
function transformPoint(
  point: Point | undefined,
  operations: Operation[]
): Point | undefined {
  for (const op of operations) {
    if (point == null) break;
    const new_point = Point.transform(point, op);
    if (new_point != null) {
      point = new_point;
    } else {
      // this happens when the node where the cursor should go
      // gets deleted.
      // console.log({ op });
      // TODO: better algo to find closest path...
      let path = [...point.path];
      while (path.length > 0) {
        point = { path, offset: 0 };
        const new_point = Point.transform(point, op);
        if (new_point != null) {
          point = new_point;
          break;
        }
        // try moving up
        path[path.length - 1] -= 1;
        if (path[path.length - 1] < 0) {
          path = path.slice(0, path.length - 1);
        }
      }
    }
  }
  return point;
}
*/
