import { ProjectActions } from "../../project_actions";

const { file_actions } = require("../../project_store");

const { ALL_FILE_BUTTON_TYPES } = require("../../project_files");

export const TERM_MODE_CHAR = "/";

// default extensions, in their order of precendence
const EXTs: ReadonlyArray<string> = ALL_FILE_BUTTON_TYPES;

function default_ext(disabled_ext: string[]) {
  for (let ext of EXTs) {
    if (disabled_ext.includes(ext)) continue;
    return ext;
  }
  // fallback, markdown files always work.
  return "md";
}

// Returns the full file_search text in addition to the default extension if applicable
// disabled_ext contains such file extensions, which aren't available in the project.
// e.g. do not autocomplete to "sagews" if it is ["sagews", "tex"]
export function full_path_text(file_search: string, disabled_ext: string[]) {
  let ext;
  if (file_search.lastIndexOf(".") <= file_search.lastIndexOf("/")) {
    ext = default_ext(disabled_ext);
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
