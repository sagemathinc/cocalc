/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AppRedux } from "@cocalc/frontend/app-framework";
import { MentionsStore, MentionsState } from "./store";
import { MentionsActions } from "./actions";
import { MentionsTable } from "./table";
import { REDUX_NAME } from "./util";
import { getNotificationFilterFromFragment } from "@cocalc/frontend/notifications/fragment";

export function init(redux: AppRedux) {
  if (redux.getStore(REDUX_NAME) != undefined) {
    return;
  }

  redux.createStore<MentionsState, MentionsStore>(REDUX_NAME, MentionsStore, {
    filter: getNotificationFilterFromFragment() ?? "unread",
  });

  redux.createActions<MentionsState, MentionsActions>(
    REDUX_NAME,
    MentionsActions
  );

  redux.createTable(REDUX_NAME, MentionsTable);
}
