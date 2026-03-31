/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level editor spec for .app files.

Default layout: Agent conversation on the left, App preview on the right.
*/

import { set } from "@cocalc/util/misc";

import { createEditor } from "../frame-tree/editor";
import type { EditorDescription } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import AgentPanel from "./agent-panel";
import AppPreview from "./app-preview";

const agent: EditorDescription = {
  type: "agent",
  short: "Agent",
  name: "AI Agent",
  icon: "robot",
  component: AgentPanel,
  commands: set([
    "-chatgpt",
    "decrease_font_size",
    "increase_font_size",
    "save",
    "time_travel",
    "undo",
    "redo",
  ]),
} as const;

const app_preview: EditorDescription = {
  type: "app_preview",
  short: "App",
  name: "App Preview",
  icon: "eye",
  component: AppPreview,
  commands: set([
    "-chatgpt",
    "decrease_font_size",
    "increase_font_size",
    "save",
    "reload",
  ]),
} as const;

const EDITOR_SPEC = {
  agent,
  app_preview,
  terminal,
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "AIAgent",
});
