import { AppRedux } from "../app-framework";
import { MentionsStore } from "./mentions/store";
import { MentionsActions } from "./mentions/actions";
import { MentionsTable } from "./mentions/table";
import { redux_name } from "./mentions/util";

export function init(redux: AppRedux) {
  if (redux.getStore(redux_name) != undefined) {
    return;
  }
  redux.createStore(redux_name, MentionsStore, { filter: "unread" });
  redux.createActions(redux_name, MentionsActions);
  redux.createTable(redux_name, MentionsTable);
}
