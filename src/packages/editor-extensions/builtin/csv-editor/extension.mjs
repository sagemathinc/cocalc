import { defineEditor, registerExtension } from "@cocalc/editor-extensions";
import { CodemirrorEditor } from "@cocalc/frontend/frame-editors/code-editor/codemirror-editor";
import Grid from "@cocalc/frontend/frame-editors/csv-editor/grid";

registerExtension(
  defineEditor({
    id: "cocalc/csv-editor",
    name: "CSV Editor",
    version: "0.0.1",
    source: "builtin",
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
