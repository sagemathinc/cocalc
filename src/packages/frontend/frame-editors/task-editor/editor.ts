/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for editing tasks
*/

import { createElement } from "react";
import { TaskEditor } from "@cocalc/frontend/editors/task-editor/editor";
import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

const tasks: EditorDescription = {
  type: "tasks",
  short: "Tasks",
  name: "Task List",
  icon: "tasks",
  component: (props) => {
    const actions = props.actions.getTaskActions(props.id);
    return createElement(TaskEditor, {
      ...props,
      actions,
      path: actions.path,
    });
  },
  commands: set([
    "decrease_font_size",
    "increase_font_size",
    "time_travel",
    "undo",
    "redo",
    "save",
    "help",
    "export_to_markdown",
    "chatgpt",
  ]),
} as const;

const EDITOR_SPEC = {
  tasks,
  terminal,
  time_travel,
} as const;

export const Editor = createEditor({
  editor_spec: EDITOR_SPEC,
  display_name: "TaskEditor",
});
