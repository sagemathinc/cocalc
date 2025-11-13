/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level React component for an X Window
*/

import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { Launcher } from "./launcher";
import { X11 } from "./x11";

export const x11: EditorDescription = {
  type: "x11",
  short: "X11",
  name: "X11",
  icon: "window-restore",
  component: X11,
  commands: set([
    "decrease_font_size",
    "increase_font_size",
    "set_zoom",
    "reload",
    "copy",
    "paste",
    "close_and_halt",
    "help",
    "connection_status",
  ]),
} as const;

export const launcher: EditorDescription = {
  type: "x11-apps",
  short: "Apps",
  name: "Applications",
  icon: "server",
  component: Launcher,
  commands: set([]),
} as const;

const EDITOR_SPEC = {
  x11,
  terminal,
  launcher,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "X11",
});
