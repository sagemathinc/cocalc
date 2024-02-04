/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level React component for the terminal
*/

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { TerminalFrame } from "./terminal";
import { CommandsGuide } from "./commands-guide";
import { set } from "@cocalc/util/misc";

const CLEAR =
  "Clearing this terminal frame terminates any running programs, respawns the shell, and cleans up the display buffer.";

export const terminal = {
  short: "Terminal",
  name: "Terminal",
  icon: "terminal",
  component: TerminalFrame,
  commands: set([
    "-actions", // none of this makes much sense for a terminal!
    /*"print", */
    "decrease_font_size",
    "increase_font_size",
    /* "find", */
    "paste",
    "copy",
    "kick_other_users_out",
    "pause",
    "edit_init_script",
    "clear",
    "help",
    "connection_status",
    "guide",
    "chatgpt",
    // "tour", -- temporarily disabled until I figure out how to to do editor tours again (fallout from pr 7180)
    "compute_server",
    /*"reload" */
  ]),
  buttons: set([
    "decrease_font_size",
    "increase_font_size",
    "clear",
    "pause",
    "kick_other_users_out",
  ]),
  hide_public: true, // never show this editor option for public view
  customizeCommands: {
    guide: {
      label: "Guide",
      title:
        "Tool for creating, testing, and learning about terminal commands.",
    },
    help: {
      title: "Show documentation for using the Linux Terminal in CoCalc.",
    },
    clear: {
      title: CLEAR,
      popconfirm: {
        title: "Clear this Terminal?",
        description: CLEAR,
        okText: "Yes, clean up!",
      },
    },
  },
} as EditorDescription;

const commands_guide = {
  short: "Guide",
  name: "Guide",
  icon: "magic",
  component: CommandsGuide,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as EditorDescription;

const EDITOR_SPEC = {
  terminal,
  commands_guide,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TerminalEditor",
});
