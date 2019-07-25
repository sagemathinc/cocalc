import { GlobalState, Route } from "./types";
import { Set } from "immutable";

export const initial_global_state: GlobalState = {
  projects: {},
  route: Route.Home,
  account_info: undefined,
  loading: true,
  opened_project_id: "",
  file_listings: {},
  current_path: "",
  selected_entries: {
    "92234d52-8a1c-4e63-bde3-f2727f5ab8b1": Set([
      "File one",
      "Folder two/",
      "Third item/in-asub/dir",
      "Dropbox/"
    ])
  }
};
