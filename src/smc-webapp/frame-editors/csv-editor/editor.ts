/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for editing CSV files
*/

import { createEditor } from "../frame-tree/editor";
import { set } from "smc-util/misc";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

import { ICON } from "./register";

const EDITOR_SPEC = {
  cm: {
    short: "CSV",
    name: "CSV Data",
    icon: ICON,
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
      "format",
    ]),
  },

  terminal,

  time_travel,
};

export const CsvEditor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "CSV Editor",
});
