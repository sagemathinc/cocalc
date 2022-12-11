/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { set } from "@cocalc/util/misc";

import TableEditor from "./table-editor";
import Dashboard from "./dashboard";

const EDITOR_SPEC = {
  table: {
    short: "Table",
    name: "Table",
    icon: "database",
    component: TableEditor,
    buttons: set([]),
  },
  dashboard: {
    short: "Dashboard",
    name: "Dashboard",
    icon: "tachometer-alt",
    component: Dashboard,
    buttons: set([]),
  },
} as { [name: string]: EditorDescription };

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CRM Editor",
});
