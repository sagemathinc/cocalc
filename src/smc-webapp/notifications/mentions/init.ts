/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AppRedux } from "../../app-framework";
import { MentionsStore, MentionsState } from "./store";
import { MentionsActions } from "./actions";
import { MentionsTable } from "./table";
import { redux_name } from "./util";

export function init(redux: AppRedux) {
  if (redux.getStore(redux_name) != undefined) {
    return;
  }
  redux.createStore<MentionsState, MentionsStore>(redux_name, MentionsStore, {
    filter: "unread",
  });
  redux.createActions<MentionsState, MentionsActions>(
    redux_name,
    MentionsActions
  );
  redux.createTable(redux_name, MentionsTable);
}
