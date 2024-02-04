/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for editing HTML documents
*/

import { set } from "@cocalc/util/misc";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription, EditorSpec } from "../frame-tree/types";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { IFrameHTML } from "./iframe-html";
import SanitizedPreview from "./rendered-html";

const EDITOR_SPEC: EditorSpec = {
  cm: {
    short: "Code",
    name: "Source Code",
    icon: "code",
    component: CodemirrorEditor,
    commands: set([
      "format_action",
      "print",
      "chatgpt",
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
      "format",
    ]),
    format_bar: true,
  } as EditorDescription,

  iframe: {
    short: "HTML",
    name: "HTML IFrame",
    icon: "compass",
    component: IFrameHTML,
    commands: set([
      "print",
      "save",
      "time_travel",
      "reload",
      "decrease_font_size",
      "increase_font_size",
      "set_zoom",
    ]),
  } as EditorDescription,

  preview: {
    short: "Preview",
    name: "Sanitized Preview",
    icon: "html5",
    component: SanitizedPreview,
    commands: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "set_zoom",
      "save",
      "time_travel",
      "reload",
    ]),
  } as EditorDescription,

  terminal,

  settings: SETTINGS_SPEC,

  time_travel,
} as const;

export const Editor = createEditor({
  editor_spec: EDITOR_SPEC,
  display_name: "HTMLEditor",
});
