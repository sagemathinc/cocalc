/*
Top-level react component for editing code.
*/

import { CodemirrorEditor } from "./codemirror-editor";
import { filename_extension, set } from "smc-util/misc2";
import { createEditor } from "../frame-tree/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { file_extensions as FORMAT } from "smc-util/code-formatter";

export const SHELLS = {
  erl: "erl",
  hrl: "erl",
  py: "python3",
  sage: "sage",
  r: "R",
  m: "octave",
  jl: "julia",
  js: "node",
  ts: "ts-node",
  coffee: "coffee",
  gp: "gp",
  lua: "lua",
  ml: "ocaml",
  pl: "perl",
  rb: "ruby"
};

export const cm = {
  short: "Code",
  name: "Source Code",
  icon: "code",
  component: CodemirrorEditor,
  buttons: function(path: string): { [name: string]: true } {
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
      "redo",
      "shell"
    ]);
    const ext = filename_extension(path);
    buttons.format = FORMAT.includes(ext);
    return buttons;
  }
};

const EDITOR_SPEC = {
  cm,
  terminal,
  time_travel
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CodeEditor"
});
