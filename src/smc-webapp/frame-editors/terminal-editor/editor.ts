/*
Top-level React component for the terminal
*/

import { createEditor } from "../frame-tree/editor";
import { Terminal } from "./terminal";
import { set } from "../generic/misc";

const EDITOR_SPEC = {
  terminal: {
    short: "Terminal",
    name: "Terminal",
    icon: "terminal",
    component: Terminal,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "find",
      "cut",
      "paste",
      "copy"
    ])
  }
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TerminalEditor"
});

