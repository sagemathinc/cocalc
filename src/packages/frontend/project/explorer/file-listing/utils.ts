/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ProjectActions } from "@cocalc/frontend/project_actions";
import { file_actions } from "@cocalc/frontend/project_store";

export const TERM_MODE_CHAR = "/";

type Extension =
  | "sagews"
  | "ipynb"
  | "tex"
  | "term"
  | "x11"
  | "rnw"
  | "rtex"
  | "rmd"
  | "md"
  | "tasks"
  | "course"
  | "sage"
  | "board"
  | "py"
  | "sage-chat";

// default extensions, in their order of precendence
// the order of these buttons also determines the precedence of suggested file extensions
// see also @cocalc/frontend/project-files.ts
export const EXTs: ReadonlyArray<Extension> = Object.freeze([
  "ipynb",
  "term",
  "board",
  "sagews",
  "tex",
  "md",
  "py",
  "rnw",
  "rtex",
  "rmd",
  "tasks",
  "course",
  "x11",
  "sage",
  "sage-chat",
]);

export function default_ext(
  disabled_ext: { includes: (s: string) => boolean } | undefined
): Extension {
  if (disabled_ext != null) {
    for (const ext of EXTs) {
      if (disabled_ext.includes(ext)) continue;
      return ext;
    }
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
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!file_actions[file_action_name].allows_multiple_files) {
      project_actions.set_all_files_unchecked();
    }
    project_actions.set_file_checked(full_path, true);
    project_actions.set_file_action(file_action_name);
  };
}
