/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

// Codemirror extension that takes as input an arrow of words (or undefined)
// and visibly keeps those marked as misspelled.  If given empty input, cancels this.
// If given another input, that replaces the current one.
CodeMirror.defineExtension("spellcheck_highlight", function (
  words: string[] | undefined
) {
  // @ts-ignore
  const cm: any = this;
  if (cm._spellcheck_highlight_overlay != null) {
    cm.removeOverlay(cm._spellcheck_highlight_overlay);
    delete cm._spellcheck_highlight_overlay;
  }
  if (words != null && words.length > 0) {
    const v: Set<string> = new Set(words);
    // define overlay mode
    const token = function (stream, state) {
      // stream.match(/^\w+/) means "begins with 1 or more word characters", and eats them all.
      if (stream.match(/^\w+/) && v.has(stream.current())) {
        return "spell-error";
      }
      // eat whitespace
      while (stream.next() != null) {
        // stream.match(/^\w+/, false) means "begins with 1 or more word characters", but don't eat them up
        if (stream.match(/^\w+/, false)) {
          return;
        }
      }
    };
    cm._spellcheck_highlight_overlay = { token };
    cm.addOverlay(cm._spellcheck_highlight_overlay);
  }
});
