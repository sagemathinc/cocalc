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
      "redo"
    ]),
    gutters: ["Codemirror-lean-info"]
  },
  /* "lean-goal": {
    short: "Goal",
    name: "Display Goal",  // more focused -- usually used in "tactic mode"
    icon: "eye",
    component: LeanInfo,
    buttons: set(["decrease_font_size", "increase_font_size"])
  }, */
  "lean-info": {
    short: "Mesages",
    name: "Display Messages" /* less focused -- usually used in "term mode" */,
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
