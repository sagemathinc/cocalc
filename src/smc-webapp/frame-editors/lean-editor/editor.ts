/*
Top-level react component for editing markdown documents
*/

import { set } from "../generic/misc";
import { createEditor } from "../frame-tree/editor";
import { LeanCodemirrorEditor } from "./lean-codemirror";
import { LeanInfo } from "./lean-info";

const EDITOR_SPEC = {
  "lean-cm": {
    short: "Input",
    name: "Input",
    icon: "code",
    component: LeanCodemirrorEditor,
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
      "reload"
    ])
  },
  "lean-info": {
    short: "Info",
    name: "Information View",
    icon: "eye",
    component: LeanInfo,
    buttons: set(["decrease_font_size", "increase_font_size"])
  }
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "LeanEditor"
});
