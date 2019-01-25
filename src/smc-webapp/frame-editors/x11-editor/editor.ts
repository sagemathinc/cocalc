/*
Top-level React component for an X Window
*/

import { createEditor } from "../frame-tree/editor";
import { X11 } from "./x11";
import { Launcher } from "./launcher";
import { set } from "smc-util/misc2";
import { terminal } from "../terminal-editor/editor";

export const x11 = {
  short: "X11",
  name: "X11",
  icon: "window-restore",
  component: X11,
  buttons: set([
    "decrease_font_size",
    "increase_font_size",
    "set_zoom",
    "reload",
    "copy",
    "paste",
    /*"print",
    "edit_init_script", */
    "close_and_halt",
    "help",
    "connection_status"
  ])
};

export const launcher = {
  short: "Apps",
  name: "Applications",
  icon: "server",
  component: Launcher,
  buttons: set([])
};

const EDITOR_SPEC = {
  x11,
  terminal,
  launcher
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "X11"
});
