/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Support display of other user's cursors

import { createContext, useContext, useMemo } from "react";
import { Map } from "immutable";
import { useSlateStatic } from "../slate-react";
import { Editor, Node, Point, Text } from "slate";

export const OtherCursorsContext = createContext<Map<string, any> | null>(null);

interface OtherCursor {
  offset: number;
  name: string;
  color: string;
}

// Map from Node to list of all cursors in that node
export const useOtherCursors = () => {
  const cursors = useContext(OtherCursorsContext)?.toJS();
  const editor = useSlateStatic();

  const nodeToCursors: WeakMap<Node, OtherCursor[]> = new WeakMap();

  if (cursors != null) {
    for (const account_id in cursors) {
      for (const cursor of cursors[account_id] ?? []) {
        if (cursor.slate != null) {
          const { path, offset } = cursor.slate;
          // TODO: for now we're ONLY implementing cursors for leafs,
          // and ignoring everything else.
          let leaf;
          try {
            leaf = Editor.leaf(editor, { path, offset })[0];
          } catch (_err) {
            // failing is expected since the document can change from
            // when the cursor was reported.
            // TODO: find nearest valid leaf?
            continue;
          }
          nodeToCursors.set(
            leaf,
            (nodeToCursors.get(leaf) ?? []).concat([
              { offset, name: "Bella Well", color: "red" },
            ])
          );
        }
      }
    }
  }
  // processing here
  return nodeToCursors;
};

export const useCursorDecorator = ({
  editor,
  cursors,
}: {
  editor: Editor;
  cursors;
}) => {
  return useMemo(() => {
    const nodeToCursors: WeakMap<Node, OtherCursor[]> = new WeakMap();

    const cursors0 = cursors?.toJS();
    if (cursors0 != null) {
      for (const account_id in cursors0) {
        for (const cursor of cursors0[account_id] ?? []) {
          if (cursor.slate != null) {
            const { path, offset } = cursor.slate;
            // TODO: for now we're ONLY implementing cursors for leafs,
            // and ignoring everything else.
            let leaf;
            try {
              leaf = Editor.leaf(editor, { path, offset })[0];
            } catch (_err) {
              // failing is expected since the document can change from
              // when the cursor was reported.
              // TODO: find nearest valid leaf?
              continue;
            }
            nodeToCursors.set(
              leaf,
              (nodeToCursors.get(leaf) ?? []).concat([
                { offset, name: "Bella Well", color: "red" }, // todo: fake for now.
              ])
            );
          }
        }
      }
    }

    return ([node, path]) => {
      const ranges: {
        anchor: Point;
        focus: Point;
        cursor: { name: string; color: string };
      }[] = [];
      if (!Text.isText(node)) return ranges;
      const c = nodeToCursors.get(node);
      if (c == null) return ranges;
      for (const cur of c) {
        const { offset, name, color } = cur;
        ranges.push({
          anchor: { path, offset },
          focus: { path, offset: offset + 1 },
          cursor: { name, color },
        });
        // TODO: just the first for now.
        break;
      }

      return ranges;
    };
  }, [cursors]);
};
