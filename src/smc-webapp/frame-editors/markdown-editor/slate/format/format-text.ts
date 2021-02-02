/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { formatSelectedText } from "./commands";

export function formatText(editor, e): boolean {
  if (!(e.ctrlKey || e.metaKey)) {
    return false;
  }

  switch (e.key) {
    case "b":
    case "i":
    case "u":
    case "x":
    case "c":
      if (e.key == "x" && !e.shiftKey) return false;
      if (e.key == "c" && !e.shiftKey) return false;
      formatSelectedText(
        editor,
        {
          b: "bold",
          i: "italic",
          u: "underline",
          x: "strikethrough",
          c: "code",
        }[e.key]
      );
      return true;
  }

  return false;
}
