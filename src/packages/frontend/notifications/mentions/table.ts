/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "@cocalc/frontend/app-framework";

export class MentionsTable extends Table {
  query() {
    return "mentions";
  }

  options(): any[] {
    return [];
  }

  _change(table, _keys): void {
    const actions = this.redux.getActions("mentions");
    if (actions == null) throw Error("actions must be defined");

    const mentions = table.get();
    actions.update_state(mentions);
  }
}
