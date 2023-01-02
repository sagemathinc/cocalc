/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { set } from "@cocalc/util/misc";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";

import TableEditor from "./table-editor";

// import Whiteboard from "../whiteboard-editor/whiteboard";
// import { whiteboardButtons } from "../whiteboard-editor/editor";

const EDITOR_SPEC = {
  tables: {
    short: "Tables",
    name: "Tables",
    icon: "database",
    component: TableEditor,
    buttons: set(["save", "undo", "redo"]),
  },
  //   whiteboard: {
  //     short: "Whiteboard",
  //     name: "Whiteboard",
  //     icon: "file-image",
  //     component: Whiteboard,
  //     buttons: whiteboardButtons,
  //   },
  time_travel,
} as { [name: string]: EditorDescription };

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CRM Editor",
});
