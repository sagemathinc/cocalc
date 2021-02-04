/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Editor, Operation, Point, Transforms } from "slate";
import { isEqual } from "lodash";

export function applyOperations(editor: Editor, operations: Operation[]): void {
  if (operations.length == 0) return;
  // const t0 = new Date().valueOf();
  const cursor: { focus: Point | null } = {
    focus: editor.selection?.focus ?? null,
  };
  try {
    (editor as any).applyingOperations = true; // TODO: not sure if this is at all necessary...

    // IMPORTANT: we use transform to apply operations.  Why?
    // Because editor.apply normalizes the document and does a bunch of
    // other things which can easily make it so the operations
    // in our list are no longer valid, e.g., their paths are wrong, etc.
    // Obviously, it is also much faster to not normalize every single
    // time too.
    for (const op of operations) {
      //console.log("apply ", op);

      // Should skip due to just removing whitespace right
      // before the user's cursor:
      if (skipCursor(cursor, op)) continue;

      if (op.type == "set_node") {
        // Unfortunately, using the set_node operation results -- when
        // that empty editor.apply set_node is called below -- in the
        // target node being unmounted and recreated.  This totally breaks
        // stateful void elements like code editors, so instead we
        // use setNodes.  It might be more expensive, but it seems to
        // work fine.
        Transforms.setNodes(editor, op.newProperties, { at: op.path });
      } else {
        Transforms.transform(editor, op);
      }
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
    /* console.log(
      `time: apply ${operations.length} operations`,
      new Date().valueOf() - t0,
      "ms"
    );*/
    // (window as any).operations = operations;
  } finally {
    (editor as any).applyingOperations = false;
  }
}

/*
There is one special case that is unavoidable without making the
plain text file really ugly.     If you type "foo " in slate (with the space),
this converts to "foo " in Markdown (with the space).  But
markdown-it converts this back to [...{text:"foo"}]
without the space at the end of the line!  Without modifying
how we apply diffs, the only solution to this problem would
be to emit "foo&#32;" which technically works, but is REALLY ugly.
So if we do not do the following operation in some cases
when the path is to the focused cursor.

  {type: "remove_text", text:"[whitespace]", path, offset}

NOTE: not doing this transform doesn't mess up paths of
subsequent ops since all this did was change some whitespace
in a single text node, hence doesn't mutate any paths.
*/
function skipCursor(cursor: { focus: Point | null }, op): boolean {
  const { focus } = cursor;
  if (focus == null) return false;
  if (
    op.type == "remove_text" &&
    isEqual(focus.path, op.path) &&
    op.text.trim() == "" &&
    op.text.length + op.offset == focus.offset
  ) {
    return true;
  }
  cursor.focus = Point.transform(focus, op);
  return false;
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
