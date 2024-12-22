/*
Codemirror integration helpers.
*/

import type { MarkerRange, Position } from "codemirror";
import { cmp } from "@cocalc/util/misc";
import { setMarkLocation } from "./comments";

export function cmp_pos(a: Position, b: Position) {
  const c = cmp(a.line, b.line);
  if (c) {
    return c;
  }
  return cmp(a.ch, b.ch);
}

export function isInRange(
  a: Position,
  range: { from: Position; to: Position },
): boolean {
  return cmp_pos(range.from, a) <= 0 && cmp_pos(a, range.to) <= 0;
}

export function positionToLinear(lines: string[], pos: Position): number {
  if (pos.line >= lines.length) {
    throw Error("invalid position");
  }
  let n = 0;
  for (let i = 0; i < pos.line; i++) {
    n += lines[i].length + 1;
  }
  return n + pos.ch;
}

export function linearToPosition(lines: string[], n: number): Position {
  for (let line = 0; line < lines.length; line++) {
    const m = lines[line].length;
    if (n > m) {
      n -= m + 1;
    } else {
      return { line, ch: n };
    }
  }
  return { line: lines.length, ch: 0 };
}

// This makes it so you can select a range that contains comment marks, cut it,
// then paste it and the marks are set again on paste.... mostly.
// TODO: It doesn't quite work properly for multiple selections (e.g., with
// multiple cursors), but that's an edge case.
export function initCommentCutPasteSupport(cm) {
  const cutCopyBuffer: { [text: string]: any[] } = {};

  cm.on("beforeChange", (_, changeObj) => {
    if (changeObj.origin != "cut") {
      return;
    }
    const text = cm.getRange(changeObj.from, changeObj.to);
    const marks: any[] = [];
    const lines = cm.getValue().split("\n");
    let start = positionToLinear(lines, changeObj.from);
    for (const mark of cm.getAllMarks()) {
      const loc = mark.find() as null | MarkerRange;
      if (loc == null) {
        continue;
      }
      if (isInRange(loc.from, changeObj) && isInRange(loc.to, changeObj)) {
        const from = positionToLinear(lines, loc.from) - start;
        const to = positionToLinear(lines, loc.to) - start;
        marks.push({ from, to, mark });
      }
    }
    if (marks.length > 0) {
      cutCopyBuffer[text] = marks;
    }
  });

  cm.on("changes", (_, changes) => {
    let k = 0;
    for (const changeObj of changes) {
      if (changeObj.origin == "paste") {
        if (cutCopyBuffer != null) {
          const s = changeObj.text.join("\n");
          const marks = cutCopyBuffer[s];
          if (marks != null) {
            delete cutCopyBuffer[s];
            const lines = cm.getValue().split("\n");
            const start = k + positionToLinear(lines, changeObj.from);
            for (const { from, to, mark } of marks) {
              const cur = mark.find();
              if (cur != null) {
                // it didn't get removed
                mark.clear();
              }
              const loc = {
                from: linearToPosition(lines, from + start),
                to: linearToPosition(lines, to + start),
              };
              setMarkLocation({ doc: cm.getDoc(), loc, mark });
            }
          }
          k += changeObj.text.join("\n").length;
        }
      }
    }
  });
}
