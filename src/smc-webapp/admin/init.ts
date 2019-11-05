import { AppRedux } from "../app-framework";
import { AdminStore, initial_state } from "./store";
import { AdminActions } from "./actions";

export function init(redux: AppRedux) {
  if (redux.getStore("admin-page") != undefined) {
    return;
  }

  const store = redux.createStore("admin-page", AdminStore, initial_state);
  const actions = redux.createActions("admin-page", AdminActions);
  actions.store = store;
}
