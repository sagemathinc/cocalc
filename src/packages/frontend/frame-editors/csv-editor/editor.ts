/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for editing CSV files
*/

import { createEditor } from "../frame-tree/editor";
import { set } from "@cocalc/util/misc";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import Grid from "./grid";

const EDITOR_SPEC = {
  grid: {
    short: "Grid",
    name: "Grid",
    icon: "table",
    component: Grid,
    buttons: set(["print", "decrease_font_size", "increase_font_size"]),
  },

  cm: {
    short: "Raw",
    name: "Raw Data",
    icon: "code",
    component: CodemirrorEditor,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "replace",
      "find",
      "goto_line",
      "cut",
      "paste",
      "copy",
      "undo",
      "redo",
    ]),
  },

  terminal,

  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CSV Editor",
});
