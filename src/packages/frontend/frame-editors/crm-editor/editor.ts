/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createEditor } from "../frame-tree/editor";
import { EditorDescription, EditorSpec } from "../frame-tree/types";
import { set } from "@cocalc/util/misc";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";

import TableEditor from "./table-editor";
import Users from "./users";

const EDITOR_SPEC: EditorSpec = {
  tables: {
    short: "Tables",
    name: "Tables",
    icon: "database",
    component: TableEditor,
    commands: set(["save", "undo", "redo"]),
  },
  account: {
    short: "Users",
    name: "User Search",
    icon: "users",
    component: Users,
  } as EditorDescription,
  time_travel,
} as const;

export const Editor = createEditor({
  editor_spec: EDITOR_SPEC,
  display_name: "CRM Editor",
});
