/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { dmp } from "smc-util/sync/editor/generic/util";

/*
Try to set the value of the buffer to something new by replacing just the ranges
that changed, so that the viewport/history/etc. doesn't get messed up.
Setting scroll_last to true sets cursor to last changed position and puts cursors
there; this is used for undo/redo.

**NOTE:** there are no guarantees, since if the patch to transform from  current to
value involves a "huge" (at least 500) number of chunks, then we just set the value
directly since apply thousands of chunks will lock the cpu for seconds.  This will
slightly mess up the scroll position, undo position, etc.  It's worth it.  We noticed
this performance edge case mostly in running prettier.

**NOTE 2:** To me this "set value without jumping" problem seems like one of the
most important basic problems to solve for collaborative editing.  I just checked
(Dec 2020) and shockingly, Google docs does _not_ solve this problem!  They just
let the screen drastically jump around in response to another editor.  Surprising,
though for them maybe it is harder due to pagination.
*/

CodeMirror.defineExtension("setValueNoJump", function (
  value: string,
  scroll_last: boolean = false
) {
  // @ts-ignore
  const cm: any = this;

  if (value == null) {
    // Special case -- trying to set to value=undefined.  This is the sort of thing
    // that might rarely happen right as the document opens or closes, for which
    // there is no meaningful thing to do but "do nothing".  We detected this periodically
    // by catching user stacktraces in production...  See
    // https://github.com/sagemathinc/cocalc/issues/1768
    // Obviously, this is something that typescript should in theory prevent (but we can't
    // risk it).
    return;
  }
  const current_value = cm.getValue();
  if (value === current_value) {
    // Special case: nothing to do
    return;
  }

  const r = cm.getOption("readOnly");
  if (!r) {
    // temporarily set editor to readOnly to prevent any potential changes.
    // This code is synchronous so I'm not sure why this is needed (I really
    // can't remember why I did this, unfortunately).
    cm.setOption("readOnly", true);
  }
  // We do the following, so the cursor events that happen as a direct result
  // of this setValueNoJump know that this is what is causing them.
  cm._setValueNoJump = true;

  // Determine information so we can restore the scroll position
  const t = cm.getScrollInfo().top;
  const b = cm.setBookmark({ line: cm.lineAtHeight(t, "local") });
  const before = cm.heightAtLine(cm.lineAtHeight(t, "local"));

  // Compute patch that transforms current_value to new value:
  const diff = dmp.diff_main(current_value, value);
  let last_pos: CodeMirror.Position | undefined = undefined;
  if (diff.length >= 500) {
    // special case -- this is a "weird" change that will take
    // an enormous amount of time to apply using diffApply.
    // For example, something that changes every line in a file
    // slightly could do this, e.g., changing from 4 space to 2 space
    // indentation, which prettier might do.  In this case, instead of
    // blocking  the user browser for several seconds, we just take the
    // hit and possibly unset the cursor.
    const scroll =
      cm.getScrollInfo().top - (before - cm.heightAtLine(b.find().line));
    cm.setValue(value);
    cm.scrollTo(undefined, scroll); // make some attempt to fix scroll.
  } else {
    // Change the buffer in place by applying the diffs as we go; this avoids replacing the entire buffer,
    // which would cause total chaos.
    last_pos = cm.diffApply(diff);
  }

  // Now, if possible, restore the exact scroll position using our bookmark.
  const n = b.find()?.line;
  if (n != null) {
    cm.scrollTo(
      undefined,
      cm.getScrollInfo().top - (before - cm.heightAtLine(b.find().line))
    );
    b.clear();
  }

  // Just do a possibly expensive double check that the above worked.  I have no reason
  // to believe the above could ever fail... but maybe it does in some very rare
  // cases, and if it did, the results would be *corruption*, which is not acceptable.
  // So... we just brutally do the set directly (messing up the cursor) if it fails, thus
  // preventing any possibility of corruption.  This will mess up cursors, etc., but that's
  // a reasonable price to pay for correctness.
  // I can't remember if this ever happens, or if I was just overly paranoid.
  if (value !== cm.getValue()) {
    console.warn("setValueNoJump failed -- setting value directly");
    cm.setValue(value);
  }

  if (!r) {
    // Also restore readOnly state.
    cm.setOption("readOnly", false);
    if (scroll_last && last_pos != null) {
      cm.scrollIntoView(last_pos);
      cm.setCursor(last_pos);
    }
  }

  delete cm._setValueNoJump;
});
