import { Action, GlobalState, Route } from "./types";
import { assert_never } from "../helpers";

export function reducer(state: GlobalState, action: Action): GlobalState {
  switch (action.type) {
    case "initial_load":
      return {
        ...state,
        projects: action.projects || [],
        account_info: action.account_info,
        loading: false
      };
    case "open_project":
      return { ...state, route: Route.Project, opened_project: action.id };
    default:
      return assert_never(action);
  }
}
