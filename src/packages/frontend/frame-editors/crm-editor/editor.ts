/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { set } from "@cocalc/util/misc";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";

import TableEditor from "./table-editor";
import Users from "./users";

const tables: EditorDescription = {
  type: "crm-tables",
  short: "Tables",
  name: "Tables",
  icon: "database",
  component: TableEditor,
  commands: set(["save", "undo", "redo"]),
} as const;

const account: EditorDescription = {
  type: "crm-account",
  short: "Users",
  name: "User Search",
  icon: "users",
  component: Users,
} as const;

const EDITOR_SPEC = {
  tables,
  account,
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CRM Editor",
});
