/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { set } from "@cocalc/util/misc";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";

import TableEditor from "./table-editor";

const EDITOR_SPEC = {
  tables: {
    short: "Tables",
    name: "Tables",
    icon: "database",
    component: TableEditor,
    buttons: set([]),
  },
  time_travel,
} as { [name: string]: EditorDescription };

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CRM Editor",
});
