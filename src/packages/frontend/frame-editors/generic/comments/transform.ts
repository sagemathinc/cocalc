/*
TODO/WARNING: this is a first simple way to transform marks from v0 of the doc to v1
of the doc.  It's fine if the doc has barely changed.  If the doc has changed
a LOT in subtle ways, it would be optimal to use a specified sequence of patches
from TimeTravel rather than one big jump!  E.g., imagine hundreds of edits
the carry along all the marks, but completely change the document.  That is
in TimeTravel, but if we just transform directly, all edits get lost.  The
information to do this is fully available... but this is also an edge case
and will hardly come up.  So we will do this, but later.
*/

import type { Mark } from "./types";
import { Doc } from "codemirror";
import { diff_main } from "@cocalc/sync/editor/generic/util";
import { diffApply } from "@cocalc/frontend/codemirror/extensions/diff-apply";
import { getPos } from "./util";

export function transformMarks({
  marks,
  v0,
  v1,
}: {
  marks: Mark[];
  v0: string;
  v1: string;
}) {
  const idToMark: { [id: string]: Mark } = {};
  const doc = new Doc(v0);
  const diff = diff_main(v0, v1);
  // apply the marks
  for (const mark of marks) {
    const { pos, id } = mark;
    idToMark[id] = mark;
    doc.markText(pos.from, pos.to, {
      clearWhenEmpty: false,
      attributes: { style: id },
    });
  }
  diffApply(doc, diff);
  // read the transformed marks
  const marks1: Mark[] = [];
  for (const mark of doc.getAllMarks()) {
    const pos = getPos(mark);
    if (pos == null) {
      continue;
    }
    const id = mark.attributes!.style;
    marks1.push({ ...idToMark[id], pos });
  }
  // console.log("transformMarks", { marks, marks1, v0, v1 });
  return marks1;
}
