/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor } from "slate";
import { ReactEditor } from "./slate-react";

// Scroll to the n-th heading in the document
export function scrollToHeading(editor: ReactEditor, n: number) {
  let i = 0;
  for (const x of Editor.nodes(editor, {
    at: { path: [], offset: 0 },
    match: (node) => node["type"] == "heading",
  })) {
    if (i == n) {
      const elt = ReactEditor.toDOMNode(editor, x[0]);
      elt.scrollIntoView(true);
      return;
    }
    i += 1;
  }
  // didn't find it.
}
