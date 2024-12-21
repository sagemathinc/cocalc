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

import type { Comment } from "./types";
import { Doc } from "codemirror";
import { diff_main } from "@cocalc/sync/editor/generic/util";
import { diffApply } from "@cocalc/frontend/codemirror/extensions/diff-apply";
import { getLocation } from "./util";

export function transformComments({
  comments,
  v0,
  v1,
}: {
  comments: Comment[];
  v0: string;
  v1: string;
}) {
  const idToComment: { [id: string]: Comment } = {};
  const doc = new Doc(v0);
  const diff = diff_main(v0, v1);
  // apply the comments
  for (const comment of comments) {
    const { loc, id } = comment;
    if (loc != null) {
      idToComment[id] = comment;
      doc.markText(loc.from, loc.to, {
        clearWhenEmpty: false,
        attributes: { style: id },
      });
    }
  }
  diffApply(doc, diff);
  // read the transformed comments
  const comments1: Comment[] = [];
  for (const comment of doc.getAllMarks()) {
    const loc = getLocation(comment);
    if (loc == null) {
      continue;
    }
    const id = comment.attributes!.style;
    comments1.push({ ...idToComment[id], loc });
  }
  // console.log("transformComments", { comments, comments1, v0, v1 });
  return comments1;
}
