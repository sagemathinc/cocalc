/*
Top-level React component for the terminal
*/

import { createEditor } from "../frame-tree/editor";
import { TerminalFrame } from "./terminal";
import { set } from "smc-util/misc2";

export const terminal = {
  short: "Terminal",
  name: "Terminal",
  icon: "terminal",
  component: TerminalFrame,
  buttons: set([
    /*"print", */
    "decrease_font_size",
    "increase_font_size",
    /* "find", */
    "paste",
    "copy",
    "kick_other_users_out",
    "pause",
    "edit_init_script",
    "help",
    "connection_status",
    /*"reload" */
  ]),
  hide_public: true, // never show this editor option for public view
};

const EDITOR_SPEC = {
  terminal,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TerminalEditor",
});
