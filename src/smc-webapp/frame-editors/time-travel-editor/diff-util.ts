/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Compute a line-level diff between two strings, which
// is useful when showing a diff between two states.
import { dmp } from "smc-util/sync/editor/generic/util";
import { StringCharMapping } from "smc-util/misc";
import * as CodeMirror from "codemirror";
require("./style.sass");

interface LineDiff {
  lines: string[];
  type: (-1 | 0 | 1)[];
  chunk_boundaries: number[];
  gutter: string[];
}

function line_diff(v0: string, v1: string): LineDiff {
  const string_mapping = new StringCharMapping();
  const patches = dmp.patch_make(
    string_mapping.to_string(v0.split("\n")),
    string_mapping.to_string(v1.split("\n"))
  );
  const to_line = string_mapping._to_string;
  return process_line_diff(patches, to_line);
}

// Here's what we assume a patch is for our code below,
// basically to make it more readable...
interface Patch {
  start1: number;
  start2: number;
  length1: number;
  length2: number;
  diffs: [-1 | 0 | 1, string][];
}

function process_line_diff(
  patches: Patch[],
  to_line: { [c: string]: string }
): LineDiff {
  const lines: string[] = [];
  const type: (-1 | 0 | 1)[] = [];
  const seen_context: { [key: string]: true } = {};
  const chunk_boundaries: number[] = [];
  const gutter: string[] = [];
  let len_diff: number = 0;
  for (const x of patches) {
    let n1: number = x.start1;
    let n2: number = x.start2;
    n1 += len_diff;
    len_diff += x.length1 - x.length2;
    let sign: string;
    let line_nums;
    for (const z of x.diffs) {
      for (const c of z[1]) {
        if (z[0] === -1) {
          sign = "-";
          n1 += 1;
          line_nums = [`${n1}`, ""];
        } else if (z[0] === 1) {
          sign = "+";
          n2 += 1;
          line_nums = ["", `${n2}`];
        } else {
          sign = " ";
          n1 += 1;
          n2 += 1;
          const key: string = `${n1}-${n2}`;
          if (seen_context[key]) {
            // don't show the same line twice in context, since that's confusing to readers
            continue;
          }
          line_nums = [`${n1}`, `${n2}`];
          seen_context[key] = true;
        }
        lines.push(to_line[c]);
        gutter.push(
          `${line_nums[0].padStart(6)} ${line_nums[1].padStart(6)}  ${sign}`
        );
        type.push(z[0]);
      }
    }
    chunk_boundaries.push(lines.length - 1);
  }
  return { lines, type, gutter, chunk_boundaries };
}

export function set_cm_line_diff(
  cm: CodeMirror.Editor,
  v0: string,
  v1: string
): void {
  const { lines, type, gutter, chunk_boundaries } = line_diff(v0, v1);
  const s = lines.join("\n");
  cm.setValue(s);

  // TODO: for now we force "default", since anything else is really confusing
  // as it conflicts with the red/green diff coloring
  cm.setOption("theme", "default");
  cm.setOption("lineNumbers", false);
  cm.setOption("showTrailingSpace" as any, false);
  cm.setOption("gutters", ["cocalc-history-diff-gutter"]);

  // highlight the lines based on type
  for (let i = 0; i < type.length; i++) {
    switch (type[i]) {
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
    elt.innerHTML = gutter[i];
    elt.setAttribute("class", "cocalc-history-diff-number");
    cm.setGutterMarker(i, "cocalc-history-diff-gutter", elt);
  }

  for (const i of chunk_boundaries) {
    cm.addLineClass(i, "wrap", "cocalc-history-diff-divide");
  }
}
