import { AppRedux } from "../../app-framework";
import { MentionsStore } from "./store";
import { MentionsActions } from "./actions";
import { MentionsTable } from "./table";
import { redux_name } from "./util";

export function init(redux: AppRedux) {
  if (redux.getStore(redux_name) != undefined) {
    return;
  }
  redux.createStore(redux_name, MentionsStore, { filter: "unread" });
  redux.createActions(redux_name, MentionsActions);
  redux.createTable(redux_name, MentionsTable);
}
