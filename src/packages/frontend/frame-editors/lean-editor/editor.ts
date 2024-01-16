/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for editing LEAN documents
*/

import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription, EditorSpec } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { LeanCodemirrorEditor } from "./lean-codemirror";
import { LeanHelp } from "./lean-help";
import { LeanInfo } from "./lean-info";
import { LeanMessages } from "./lean-messages";

const EDITOR_SPEC: EditorSpec = {
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
      "redo",
      "restart",
      "close_and_halt",
    ]),
    gutters: ["Codemirror-lean-messages"],
  } as EditorDescription,
  "lean-info": {
    short: "Info",
    name: "Info at Cursor", // more focused -- usually used in "tactic mode"
    icon: "info-circle",
    component: LeanInfo,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  "lean-messages": {
    short: "Mesages",
    name: "All Messages" /* less focused -- usually used in "term mode" */,
    icon: "eye",
    component: LeanMessages,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  "lean-help": {
    short: "Help",
    name: "Help at Cursor",
    icon: "question-circle",
    component: LeanHelp,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  terminal,
  time_travel,
} as const;

export const Editor = createEditor({
  editor_spec: EDITOR_SPEC,
  display_name: "LeanEditor",
});
