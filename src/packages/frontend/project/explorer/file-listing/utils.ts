/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";

import { Icon } from "@cocalc/frontend/components";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { NEW_FILETYPE_ICONS } from "@cocalc/frontend/project/new/consts";
import type { FileAction } from "@cocalc/frontend/project_actions";
import { FILE_ACTIONS, ProjectActions } from "@cocalc/frontend/project_actions";
import { COLORS } from "@cocalc/util/theme";

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
  | "slides"
  | "py"
  | "sage-chat";

// default extensions, in their order of precedence
// the order of these buttons also determines the precedence of suggested file extensions
// see also @cocalc/frontend/project-files.ts
export const EXTs: ReadonlyArray<Extension> = Object.freeze([
  "ipynb",
  "term",
  "board",
  "slides",
  "md",
  "sagews",
  "tex",
  "course",
  "py",
  "rnw",
  "rtex",
  "rmd",
  "tasks",
  "x11",
  "sage",
  "sage-chat",
]);

export function default_ext(
  disabled_ext: { includes: (s: string) => boolean } | undefined,
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

/**
 * Compute sorted type filter options from a set of extensions present
 * in the current directory. Ordering: "folder" first, then prioritized
 * extensions from EXTs (in that order), then remaining alphabetically.
 *
 * Used by both the large explorer table and the flyout type filter.
 */
export function sortedTypeFilterOptions(
  extensions: Iterable<string>,
): string[] {
  const extSet = new Set(extensions);
  const result: string[] = [];

  // 1. Folder first
  if (extSet.has("folder")) {
    result.push("folder");
    extSet.delete("folder");
  }

  // 2. Prioritized extensions from EXTs, in order
  for (const ext of EXTs) {
    if (extSet.has(ext)) {
      result.push(ext);
      extSet.delete(ext);
    }
  }

  // 3. Remaining extensions alphabetically
  const rest = Array.from(extSet).sort();
  result.push(...rest);

  return result;
}

/**
 * Render a rich label for a file-type filter option:
 *   [icon] Human Name  .ext
 * Used by both the explorer table column filter and the flyout type dropdown.
 */
export function renderTypeFilterLabel(ext: string): React.ReactNode {
  if (ext === "folder") {
    return React.createElement(
      "span",
      { style: { whiteSpace: "nowrap" } },
      React.createElement(Icon, {
        name: "folder-open",
        style: { width: 20, marginRight: 6 },
      }),
      "Folder",
    );
  }

  const iconOverride =
    NEW_FILETYPE_ICONS[ext as keyof typeof NEW_FILETYPE_ICONS];
  const info = file_options(`file.${ext}`);
  const iconName = iconOverride ?? info?.icon ?? "file";
  const name = info?.name;

  return React.createElement(
    "span",
    { style: { whiteSpace: "nowrap" } },
    React.createElement(Icon, {
      name: iconName,
      style: { width: 20, marginRight: 6 },
    }),
    name ? `${name} ` : "",
    React.createElement("span", { style: { color: COLORS.GRAY } }, `.${ext}`),
  );
}

export function generate_click_for(
  file_action_name: FileAction,
  full_path: string,
  project_actions: ProjectActions,
) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!FILE_ACTIONS[file_action_name].allows_multiple_files) {
      project_actions.set_all_files_unchecked();
    }
    project_actions.set_file_checked(full_path, true);
    project_actions.set_file_action(file_action_name);
  };
}
