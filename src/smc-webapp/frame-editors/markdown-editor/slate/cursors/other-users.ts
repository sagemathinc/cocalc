/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Support display of other user's cursors

import { createContext, useContext, useMemo } from "react";
import { Map } from "immutable";
import { useSlateStatic } from "../slate-react";
import { Editor, Node, Point, Text } from "slate";
import { getProfile } from "smc-webapp/jupyter/cursors";
import { redux } from "smc-webapp/app-framework";

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
    const user_map = redux.getStore("users").get("user_map");
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
          const { name, color } = getProfile(account_id, user_map);
          nodeToCursors.set(
            leaf,
            (nodeToCursors.get(leaf) ?? []).concat([{ offset, name, color }])
          );
        }
      }
    }
  }
  // processing here
  return nodeToCursors;
};

export const useCursorDecorate = ({
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
      const user_map = redux.getStore("users").get("user_map");
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
            const { name, color } = getProfile(account_id, user_map);
            nodeToCursors.set(
              leaf,
              (nodeToCursors.get(leaf) ?? []).concat([{ offset, name, color }])
            );
          }
        }
      }
    }

    return ([node, path]) => {
      const ranges: {
        anchor: Point;
        focus: Point;
        cursor: { name: string; color: string; paddingText?: string };
      }[] = [];
      if (!Text.isText(node)) return ranges;
      const c = nodeToCursors.get(node);
      if (c == null) return ranges;
      for (const cur of c) {
        const { offset, name, color } = cur;
        if (offset < node.text.length - 1) {
          ranges.push({
            anchor: { path, offset },
            focus: { path, offset: offset + 1 },
            cursor: { name, color },
          });
        } else {
          ranges.push({
            anchor: { path, offset: offset - 1 },
            focus: { path, offset: offset },
            cursor: {
              name,
              color,
              paddingText: node.text[node.text.length - 1],
            },
          });
        }
        // TODO: just the first for now.
        break;
      }

      return ranges;
    };
  }, [cursors]);
};
