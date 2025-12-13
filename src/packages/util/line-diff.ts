/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Line-level diff utility that is UI-agnostic. It converts a character-level
// diff into per-line slices with left/right line numbers so callers can render
// readable diffs (patchflow summaries, chat activity, time-travel viewer, etc.).

import { patch_make } from "./patch";
import { StringCharMapping } from "./misc";

export type LineDiffOp = -1 | 0 | 1;

export interface LineDiffResult {
  // Content of the line after expansion of the char mapping.
  lines: string[];
  // Operation per line: -1 delete, 0 context, 1 insert.
  types: LineDiffOp[];
  // Human readable line numbers for left/right (already padded/gutter-ready).
  gutters: string[];
  // Indices where diff hunks end; useful for drawing separators.
  chunkBoundaries: number[];
}

interface Patch {
  start1: number;
  start2: number;
  length1: number;
  length2: number;
  diffs: [LineDiffOp, string][];
}

// Compute a line-level diff between two strings.
export function computeLineDiff(a: string, b: string): LineDiffResult {
  const mapping = new StringCharMapping();
  const patches = patch_make(
    mapping.to_string(a.split("\n")),
    mapping.to_string(b.split("\n")),
  );
  return processLineDiff(patches as Patch[], mapping._to_string);
}

function processLineDiff(
  patches: Patch[],
  toLine: { [c: string]: string },
): LineDiffResult {
  const lines: string[] = [];
  const types: LineDiffOp[] = [];
  const seenContext: { [key: string]: true } = {};
  const chunkBoundaries: number[] = [];
  const gutters: string[] = [];
  let lenDiff = 0;

  for (const patch of patches) {
    let n1 = patch.start1;
    let n2 = patch.start2;
    n1 += lenDiff;
    lenDiff += patch.length1 - patch.length2;
    for (const diff of patch.diffs) {
      for (const c of diff[1]) {
        let sign: string;
        let lineNums: [string, string];
        if (diff[0] === -1) {
          sign = "-";
          n1 += 1;
          lineNums = [`${n1}`, ""];
        } else if (diff[0] === 1) {
          sign = "+";
          n2 += 1;
          lineNums = ["", `${n2}`];
        } else {
          sign = " ";
          n1 += 1;
          n2 += 1;
          const key = `${n1}-${n2}`;
          // Avoid repeating identical context lines.
          if (seenContext[key]) {
            continue;
          }
          lineNums = [`${n1}`, `${n2}`];
          seenContext[key] = true;
        }
        lines.push(toLine[c]);
        gutters.push(
          `${lineNums[0].padStart(6)} ${lineNums[1].padStart(6)}  ${sign}`,
        );
        types.push(diff[0]);
      }
    }
    if (lines.length > 0) {
      chunkBoundaries.push(lines.length - 1);
    }
  }

  return { lines, types, gutters, chunkBoundaries };
}

