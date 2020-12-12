/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";

CodeMirror.defineExtension("tab_as_space", function () {
  const cursor = this.getCursor();
  for (let i = 0; i < this.options.tabSize; i++) {
    this.replaceRange(" ", cursor);
  }
});
