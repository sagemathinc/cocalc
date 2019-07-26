import { Set } from "immutable";
import { Action, GlobalState, Route, SelectedEntries } from "./types";
import { assert_never } from "../helpers";

export function reducer(state: GlobalState, action: Action): GlobalState {
  console.log("ACTION RECIEVED", action);
  switch (action.type) {
    case "initial_load":
      return {
        ...state,
        projects: action.projects || {},
        account_info: action.account_info,
        loading: false
      };
    case "open_project":
      return {
        ...state,
        route: Route.Project,
        opened_project_id: action.id,
        current_path: ""
      };
    case "add_directory_listing":
      const file_listings = state.file_listings || {};
      if (!file_listings[action.project_id]) {
        file_listings[action.project_id] = {};
      }
      const target_projects_file_listings = file_listings[action.project_id];
      target_projects_file_listings[action.path] = action.listing.split("\n");
      return { ...state, file_listings };
    case "open_directory":
      return { ...state, current_path: action.path };
    case "open_parent_directory":
      const segments = state.current_path.split("/");
      let parent_path = segments.slice(0, segments.length - 2).join("/");
      if (parent_path !== "") {
        parent_path += "/";
      }
      return { ...state, current_path: parent_path };
    case "add_entry":
    case "remove_entry":
      return {
        ...state,
        selected_entries: selected_entries_reducer(state.selected_entries, action)
      };
    default:
      return assert_never(action);
  }
}

function selected_entries_reducer(
  state: SelectedEntries,
  action: Extract<Action, { type: "add_entry" | "remove_entry" }>
): SelectedEntries {
  const { path, project_id } = action;
  const selected_project_entries = state[project_id] || Set();

  switch (action.type) {
    case "add_entry":
      return { ...state, [project_id]: selected_project_entries.add(path) };
    case "remove_entry":
      return { ...state, [project_id]: selected_project_entries.remove(path) };
    default:
      return assert_never(action);
  }
}
