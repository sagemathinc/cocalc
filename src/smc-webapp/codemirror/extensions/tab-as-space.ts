/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

CodeMirror.defineExtension("tab_as_space", function () {
  // @ts-ignore
  const cm: any = this;
  const selections = cm.listSelections();
  selections.reverse();
  for (const sel of selections) {
    for (let i = 0; i < cm.options.tabSize; i++) {
      cm.replaceRange(" ", sel.head);
    }
  }
});
