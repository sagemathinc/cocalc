/*
Top-level react component for editing code.
*/

import { CodemirrorEditor } from "./codemirror-editor";
import { filename_extension, set } from "../generic/misc";
import { createEditor } from "../frame-tree/editor";
import { terminal } from "../terminal-editor/editor";

const FORMAT = set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
  "md",
  "css",
  "py",
  "r",
  "go",
  "yaml",
  "yaml",
  "c",
  "c++",
  "cc",
  "cpp",
  "h"
]);

export const cm = {
  short: "Code",
  name: "Source Code",
  icon: "code",
  component: CodemirrorEditor,
  buttons: function(path: string): any {
    const buttons: any = set([
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
      "redo"
    ]);
    if (FORMAT[filename_extension(path)]) {
      buttons.format = true;
    }
    return buttons;
  }
};

const EDITOR_SPEC = {
  cm,
  terminal
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CodeEditor"
});
