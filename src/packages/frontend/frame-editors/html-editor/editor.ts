/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for editing HTML documents
*/

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { set } from "@cocalc/util/misc";
import SanitizedPreview from "./rendered-html";
import { IFrameHTML } from "./iframe-html";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

const cm: EditorDescription = {
  type: "cm",
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
    "settings",
  ]),
} as const;

const iframe: EditorDescription = {
  type: "iframe",
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
} as const;

const preview: EditorDescription = {
  type: "preview-html",
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
} as const;

const EDITOR_SPEC = {
  cm,
  iframe,
  preview,
  terminal,
  settings: SETTINGS_SPEC,
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "HTMLEditor",
});
