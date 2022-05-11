/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Support display of other user's cursors

import { useMemo } from "react";
import { Map } from "immutable";
import { Editor, Node, Point, Text } from "slate";
import { getProfile } from "@cocalc/frontend/jupyter/cursors";
import { redux } from "@cocalc/frontend/app-framework";
import { markdownPositionToSlatePoint } from "../sync";
import { SearchHook } from "../search";
import { SlateEditor } from "../editable-markdown";

interface OtherCursor {
  offset: number;
  name: string;
  color: string;
}

export const useCursorDecorate = ({
  editor,
  value,
  cursors,
  search, // passed in since can only have one decorate function.
}: {
  editor: SlateEditor;
  value: string;
  cursors?: Map<string, any>;
  search: SearchHook;
  // NOTE: Passing search in is really ugly but we are doing it because slate
  // can only have one decorate function at once and both search and cursors
  // use decorate at once.  **NOTE/TODO:** if a text node has a search result in
  // it **and** a cursor, then only the search is shown.
}) => {
  // NOTE: It is VERY important to only update this decorate function
  // when things really change. Otherwise every Text node in the slate editor
  // will get re-rendereded (forced by the decorate function changing identity).
  return useMemo(() => {
    const nodeToCursors: WeakMap<Node, OtherCursor[]> = new WeakMap();

    const cursors0 = cursors?.toJS();
    if (cursors0 != null) {
      const user_map = redux.getStore("users").get("user_map");
      for (const account_id in cursors0) {
        for (const cursor of cursors0[account_id] ?? []) {
          // TODO -- insanely inefficient!
          const loc = markdownPositionToSlatePoint({
            markdown: value,
            pos: { line: cursor.y, ch: cursor.x },
            editor,
          });
          if (loc == null) continue;
          const { path, offset } = loc;
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

    return ([node, path]) => {
      // We do the search decorate and if there is no search,
      // then we do the cursor.  TODO: maybe combine, though if
      // you are searching, seeing cursors blocking search results
      // could be annoying.
      const s = search.decorate([node, path]);
      if (s.length > 0) return s;
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
          // You can't make an *empty* decorated block, since
          // it just gets discarded.... or does it?
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
        // TODO: We are just showing the first user cursor for now, even if
        // they have multiple cursors (only happens if they are using source view)
        // or there are multiple users editing that text node.
        break;
      }

      return ranges;
    };
  }, [cursors, value, search.search]);
};
