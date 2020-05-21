/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// see http://stackoverflow.com/questions/3169786/clear-text-selection-with-javascript
export function clear_selection() {
  if (typeof window.getSelection === "function") {
    const selection = window.getSelection();
    if (selection == null) return;
    if (typeof selection.empty === "function") {
      // chrome
      window.getSelection().empty();
    } else if (typeof selection.removeAllRanges === "function") {
      //firefox
      window.getSelection().removeAllRanges();
    }
  } else {
    if (
      document.selection != null &&
      typeof document.selection.empty === "function"
    ) {
      document.selection.empty();
    }
  }
}
