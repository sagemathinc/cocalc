/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Range, Transforms } from "slate";
import { ReactEditor } from "../slate-react";
import { selectNextMatch } from "./find-matches";
import { nextMatch } from "./search-control";
import { alert_message } from "alerts";

function lowestNode(editor: Editor) {
  for (const [node] of Editor.nodes(editor, { mode: "lowest" })) {
    return node;
  }
}

export function replaceOne(
  editor: ReactEditor,
  decorate,
  replace: string,
  noScroll: boolean = false
): boolean {
  // collapse selection to the starting edge
  if (editor.selection) {
    const edges = Range.edges(editor.selection);
    Transforms.setSelection(editor, { focus: edges[0], anchor: edges[0] });
  }
  // find next match
  if (selectNextMatch(editor, decorate)) {
    const node = lowestNode(editor);
    if (node != null) {
      if (!Editor.isVoid(editor, node)) {
        Transforms.insertText(editor, replace);
        // Important -- note that insertText puts the focus **after**
        // the inserted text.  It's important to keep this in mind so that
        // the result of replace=search string isn't to make something
        // that we immediately replace again thus blowing up the document!
        // Make sure to preserve this invariant when implementing this for
        // voids.
      } else {
        // TODO: need to handle void elements differently via a plugin mechanism.
        alert_message({
          type: "info",
          message:
            "Replacing nodes of this type not yet implemented. Please use source view.",
        });
        // At least move to next one no matter what.
        if (noScroll) {
          selectNextMatch(editor, decorate);
        }
      }
    }
    if (!noScroll) {
      // Now select and focus whatever is next after what we just
      // replaced, in preparation for doing the *next* replace.
      nextMatch(editor, decorate);
    }
    return true;
  }
  return false;
}

export function replaceAll(
  editor: ReactEditor,
  decorate,
  replace: string
): void {
  // Keep replacing until nothing left to replace.  However, we also keep
  // of focus points after doing selection so that if for some crazy reason
  // this would loop around forever  -- e.g., a replace doesn't work properly,
  // or maybe the goal of the replace is to add a copy of what is being searched
  // for into the document -- in that case, we immediately bail.
  const pastSelections = new Set<string>([]);
  while (replaceOne(editor, decorate, replace, true)) {
    const cur = JSON.stringify(editor.selection?.focus ?? {});
    if (pastSelections.has(cur)) return;
    pastSelections.add(cur);
  }
}
