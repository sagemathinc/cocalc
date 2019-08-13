import { GlobalState, Route } from "./types";

export const initial_global_state: GlobalState = {
  projects: {},
  route: Route.Home,
  account_info: undefined,
  loading: true,
  opened_project_id: "",
  file_listings: {},
  current_path: "",
  opened_directories: {},
  selected_entries: {},
  excluded_entries: {},
  context: { id_token: "", nonce: "", return_path: "" },
  errors: []
};
