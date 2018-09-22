/*
Top-level react component for editing markdown documents
*/

import { set } from "../generic/misc";
import { createEditor } from "../frame-tree/editor";
import { LeanCodemirrorEditor } from "./lean-codemirror";
import { LeanMessages } from "./lean-messages";
import { LeanInfo } from "./lean-info";
import { terminal } from "../terminal-editor/editor";

const EDITOR_SPEC = {
  "cm-lean": {
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
    gutters: ["Codemirror-lean-messages"]
  },
  "lean-info": {
    short: "Info",
    name: "Info at Cursor",  // more focused -- usually used in "tactic mode"
    icon: "bullseye",
    component: LeanInfo,
    buttons: set(["decrease_font_size", "increase_font_size"])
  },
  "lean-messages": {
    short: "Mesages",
    name: "All Messages" /* less focused -- usually used in "term mode" */,
    icon: "eye",
    component: LeanMessages,
    buttons: set(["decrease_font_size", "increase_font_size"])
  },
  terminal
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "LeanEditor"
});
