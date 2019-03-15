import { ProjectActions } from "../../project_actions";

const { file_actions } = require("../../project_store");

export const TERM_MODE_CHAR = "/";

// Returns the full file_search text in addition to the default extension if applicable
export function full_path_text(file_search: string) {
  let ext;
  if (file_search.lastIndexOf(".") <= file_search.lastIndexOf("/")) {
    ext = "sagews";
  }
  if (ext && file_search.slice(-1) !== "/") {
    return `${file_search}.${ext}`;
  } else {
    return `${file_search}`;
  }
}

export function generate_click_for(
  file_action_name: string,
  full_path: string,
  project_actions: ProjectActions
) {
  return e => {
    e.preventDefault();
    e.stopPropagation();
    if (!file_actions[file_action_name].allows_multiple_files) {
      project_actions.set_all_files_unchecked();
    }
    project_actions.set_file_checked(full_path, true);
    project_actions.set_file_action(file_action_name);
  };
}
