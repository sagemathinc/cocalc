/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level React component for the terminal
*/

import { editor, labels } from "@cocalc/frontend/i18n";
import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { CommandsGuide } from "./commands-guide";
import { TerminalFrame } from "./terminal";

export const terminal: EditorDescription = {
  type: "terminal",
  short: labels.terminal,
  name: labels.terminal,
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
    "settings",
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
      label: labels.guide,
      title: editor.guide_tooltip,
    },
    help: {
      title: editor.terminal_cmd_help_title,
    },
    clear: {
      title: editor.clear_terminal_tooltip,
      popconfirm: ({ intl }) => {
        return {
          title: intl.formatMessage(editor.clear_terminal_popconfirm_title),
          description: intl.formatMessage(editor.clear_terminal_tooltip),
          okText: intl.formatMessage(editor.clear_terminal_popconfirm_confirm),
        };
      },
    },
  },
} as const;

const commands_guide: EditorDescription = {
  type: "terminal-guide",
  short: labels.guide,
  name: labels.guide,
  icon: "magic",
  component: CommandsGuide,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const EDITOR_SPEC = {
  terminal,
  commands_guide,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TerminalEditor",
});
