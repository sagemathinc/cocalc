/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for editing LEAN documents
*/

import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { LeanCodemirrorEditor } from "./lean-codemirror";
import { LeanMessages } from "./lean-messages";
import { LeanInfo } from "./lean-info";
import { LeanHelp } from "./lean-help";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

const cm_lean: EditorDescription = {
  type: "cm-lean",
  short: "Input",
  name: "Input",
  icon: "code",
  component: LeanCodemirrorEditor,
  commands: set([
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
    "restart",
    "close_and_halt",
  ]),
  gutters: ["Codemirror-lean-messages"],
} as const;

const lean_info: EditorDescription = {
  type: "lean-info",
  short: "Info",
  name: "Info at Cursor", // more focused -- usually used in "tactic mode"
  icon: "info-circle",
  component: LeanInfo as any, // TODO: rclass wrapper does not fit the EditorDescription type
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const lean_messages: EditorDescription = {
  type: "lean-messages",
  short: "Mesages",
  name: "All Messages" /* less focused -- usually used in "term mode" */,
  icon: "eye",
  component: LeanMessages as any, // TODO: rclass wrapper does not fit the EditorDescription type
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const lean_help: EditorDescription = {
  type: "lean-help",
  short: "Help",
  name: "Help at Cursor",
  icon: "question-circle",
  component: LeanHelp as any, // TODO: rclass wrapper does not fit the EditorDescription type
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const EDITOR_SPEC = {
  "cm-lean": cm_lean,
  "lean-info": lean_info,
  "lean-messages": lean_messages,
  "lean-help": lean_help,
  terminal,
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "LeanEditor",
});
