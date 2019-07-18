import { GlobalState, Action } from "./types";

export function reducer(state: GlobalState, action: Action): GlobalState {
  switch (action.type) {
    case "initial_load":
      return {
        ...state,
        projects: action.projects || [],
        account_info: action.account_info,
        loading: false
      };
    case "set_projects":
      return { ...state, projects: action.projects };
    case "set_account_info":
      return { ...state, account_info: action.account_info };
    case "change_route":
      return { ...state, route: action.route };
    default:
      throw new Error();
  }
}
