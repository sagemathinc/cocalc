/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { set } from "@cocalc/util/misc";

import People from "./people";
import Accounts from "./accounts";
import Organizations from "./organizations";

const EDITOR_SPEC = {
  people: {
    short: "People",
    name: "People",
    icon: "users",
    component: People,
    buttons: set(["decrease_font_size", "increase_font_size", "save"]),
  } as EditorDescription,
  accounts: {
    short: "Accounts",
    name: "Accounts",
    icon: "users",
    component: Accounts,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  organizations: {
    short: "Orgs",
    name: "Organizations",
    icon: "home",
    component: Organizations,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CRM Editor",
});
