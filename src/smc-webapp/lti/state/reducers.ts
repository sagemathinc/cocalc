import { Set } from "immutable";
import {
  Action,
  GlobalState,
  Route,
  OpenedDirectories,
  SelectedEntries,
  ExcludedEntries
} from "./types";
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

      // Split and filter out hidden items
      file_listings[action.project_id][action.path] = action.listing
        .split("\n")
        .filter(item_name => {
          return item_name[0] !== "." && item_name !== "";
        });

      return { ...state, file_listings };
    case "open_directory":
    case "close_directory":
      return {
        ...state,
        opened_directories: opened_directories_reducer(
          state.opened_directories,
          action
        )
      };
    case "add_entry":
    case "remove_entry":
      const { selected_entries, excluded_entries } = selected_entries_reducer(
        state.selected_entries,
        state.excluded_entries,
        action
      );
      return {
        ...state,
        selected_entries,
        excluded_entries
      };
    default:
      return assert_never(action);
  }
}

function opened_directories_reducer(
  opened_directories: OpenedDirectories,
  action: Extract<Action, { type: "open_directory" | "close_directory" }>
) {
  const { path, project_id } = action;
  const opened_project_directories = opened_directories[project_id] || Set();
  switch (action.type) {
    case "open_directory":
      return {
        ...opened_directories,
        [project_id]: opened_project_directories.add(path)
      };
    case "close_directory":
      return {
        ...opened_directories,
        [project_id]: opened_project_directories.remove(path)
      };
    default:
      return assert_never(action);
  }
}

function selected_entries_reducer(
  selected_entries: SelectedEntries,
  excluded_entries: ExcludedEntries,
  action: Extract<Action, { type: "add_entry" | "remove_entry" }>
): { selected_entries: SelectedEntries; excluded_entries: ExcludedEntries } {
  const { path, project_id } = action;
  const selected_project_entries = selected_entries[project_id] || Set();
  const excluded_project_entries = excluded_entries[project_id] || Set();

  switch (action.type) {
    case "add_entry":
      const exclusions_without_descendants = excluded_project_entries.filter(
        possible_descendant => {
          return !possible_descendant.startsWith(path);
        }
      );

      return {
        selected_entries: {
          ...selected_entries,
          [project_id]: selected_project_entries.add(path)
        },
        excluded_entries: {
          ...excluded_entries,
          [project_id]: exclusions_without_descendants
        }
      };
    case "remove_entry":
      const entries_without_descendants = selected_project_entries.filter(
        possible_descendant => {
          return !possible_descendant.startsWith(path);
        }
      );
      return {
        selected_entries: {
          ...selected_entries,
          [project_id]: entries_without_descendants
        },
        excluded_entries: {
          ...excluded_entries,
          [project_id]: excluded_project_entries.add(path)
        }
      };
    default:
      return assert_never(action);
  }
}
