/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the CSV editor
*/

import { defineEditor, registerExtension } from "@cocalc/editor-extensions";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import Grid from "./grid";

registerExtension(
  defineEditor({
    id: "cocalc/csv-editor",
    name: "CSV Editor",
    extensions: ["csv"],
    icon: "csv",
    nativeFrames: ["timetravel"],
    sync: {
      doctype: "syncstring",
    },
    frames: {
      "cocalc/csv-grid": {
        short: "Grid",
        name: "Grid",
        icon: "table",
        component: Grid,
        commands: ["decrease_font_size", "increase_font_size", "chatgpt"],
      },
      "cocalc/csv-raw": {
        short: "Raw",
        name: "Raw Data",
        icon: "code",
        component: CodemirrorEditor,
        commands: [
          "chatgpt",
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
        ],
      },
    },
    defaultLayout: {
      direction: "col",
      type: "node",
      first: {
        type: "cocalc/csv-grid",
      },
      second: {
        type: "cocalc/csv-raw",
      },
    },
  }),
);
