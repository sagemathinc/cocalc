/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Compute a line-level diff between two strings, which
// is useful when showing a diff between two states.
import { computeLineDiff } from "@cocalc/util/line-diff";
import * as CodeMirror from "codemirror";
import "./style.sass";

export function set_cm_line_diff(
  cm: CodeMirror.Editor,
  v0: string,
  v1: string,
): void {
  const { lines, types, gutters, chunkBoundaries } = computeLineDiff(v0, v1);
  const s = lines.join("\n");
  cm.setValue(s);

  // TODO: for now we force "default", since anything else is really confusing
  // as it conflicts with the red/green diff coloring
  cm.setOption("theme", "default");
  cm.setOption("lineNumbers", false);
  cm.setOption("showTrailingSpace" as any, false);
  cm.setOption("gutters", ["cocalc-history-diff-gutter"]);

  // highlight the lines based on type
  for (let i = 0; i < types.length; i++) {
    switch (types[i]) {
      case -1: // deletion
        cm.addLineClass(i, "wrap", `cocalc-history-diff-delete`);
        cm.removeLineClass(i, "wrap", `cocalc-history-diff-insert`);
        break;
      case 1: // addition
        cm.addLineClass(i, "wrap", `cocalc-history-diff-insert`);
        cm.removeLineClass(i, "wrap", `cocalc-history-diff-delete`);
        break;
      case 0: // context (stays the same)
        cm.removeLineClass(i, "wrap");
        cm.removeLineClass(i, "wrap");
        break;
    }
    const elt = document.createElement("span");
    elt.innerHTML = gutters[i];
    elt.setAttribute("class", "cocalc-history-diff-number");
    cm.setGutterMarker(i, "cocalc-history-diff-gutter", elt);
  }

  for (const i of chunkBoundaries) {
    cm.addLineClass(i, "wrap", "cocalc-history-diff-divide");
  }
}
