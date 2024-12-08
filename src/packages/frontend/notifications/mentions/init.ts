/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

  const { filter, id } = getNotificationFilterFromFragment();

  redux.createStore<MentionsState, MentionsStore>(REDUX_NAME, MentionsStore, {
    filter,
    id,
  });

  redux.createActions<MentionsState, MentionsActions>(
    REDUX_NAME,
    MentionsActions,
  );

  redux.createTable(REDUX_NAME, MentionsTable);
}
