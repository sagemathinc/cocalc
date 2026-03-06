/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Shared navigation helper for decoupled browsing paths.
 *
 * Both the explorer and the flyout use independent browsing paths.
 * This module provides the path-history logic and directory-watching
 * side-effects so each consumer can call `navigateBrowsingPath()`
 * without duplicating the adjacency/nesting algorithm.
 */

import { redux } from "@cocalc/frontend/app-framework";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";

type BrowsingPathKey = "explorer_browsing_path" | "flyout_browsing_path";

function lsKey(project_id: string, pathKey: BrowsingPathKey): string {
  return `${project_id}::${pathKey}`;
}

/**
 * Read the last browsing path from localStorage.
 * Returns "" (project root) if nothing was stored.
 */
export function getInitialBrowsingPath(
  project_id: string,
  pathKey: BrowsingPathKey,
): string {
  return LS.get<string>(lsKey(project_id, pathKey)) ?? "";
}

/**
 * Compute the next `historyPath` given the current one and a new path.
 *
 * Uses the same adjacency/nesting algorithm as `set_current_path`
 * in `project_actions.ts`:
 * - If the new path is *adjacent* (not a descendant of the current
 *   history) or *nested deeper*, update history to the new path.
 * - Otherwise keep the existing history (navigating upward).
 */
export function computeHistoryPath(
  prevHistory: string,
  nextPath: string,
): string {
  const isAdjacent =
    nextPath.length > 0 && !(prevHistory + "/").startsWith(nextPath + "/");
  const isNested = nextPath.length > prevHistory.length;
  return isAdjacent || isNested ? nextPath : prevHistory;
}

/**
 * Navigate a decoupled browsing path (explorer or flyout).
 *
 * Sets the Redux state keys, watches the target directory, and
 * clears the file selection.
 *
 * @param project_id  — the project
 * @param path        — target directory
 * @param prevHistory — the previous history path (for breadcrumb depth)
 * @param pathKey     — Redux key for the browsing path
 *                      (`"explorer_browsing_path"` or `"flyout_browsing_path"`)
 * @param historyKey  — Redux key for the history path
 *                      (`"explorer_history_path"` or `"flyout_history_path"`)
 */
export function navigateBrowsingPath(
  project_id: string,
  path: string,
  prevHistory: string,
  pathKey: BrowsingPathKey,
  historyKey: "explorer_history_path" | "flyout_history_path",
): void {
  if (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  // Resolve ".." segments so paths like "foo/bar/.." become "foo"
  // instead of polluting breadcrumbs/cache keys with literal "..".
  path = normalizeDotDot(path);

  const nextHistory = computeHistoryPath(prevHistory, path);
  const actions = redux.getProjectActions(project_id);

  const isExplorer = pathKey === "explorer_browsing_path";

  // Persist to localStorage so the path survives page reloads.
  LS.set(lsKey(project_id, pathKey), path);

  actions?.setState({
    [pathKey]: path,
    [historyKey]: nextHistory,
    // Clear selection state — stale anchors / keyboard indices from the
    // previous directory would cause incorrect range/keyboard selections.
    most_recent_file_click: undefined,
    selected_file_index: undefined,
    // Propagate to the corresponding "+New" context so file creation
    // targets the directory the user is currently browsing.
    ...(isExplorer ? { new_page_path: path } : { flyout_new_path: path }),
  } as any);

  // Keep the browser URL in sync with the explorer's browsing path so that
  // page refresh restores the correct directory (not the stale current_path).
  if (isExplorer) {
    actions?.set_url_to_path(path);
  }

  // Watch directory so push-based listing updates arrive
  try {
    redux.getProjectStore(project_id)?.get_listings()?.watch(path, true);
  } catch {
    // listings not available yet
  }

  // Immediately fetch the listing so the UI doesn't wait for the next
  // push cycle (which can be up to MIN_INTEREST_INTERVAL_MS = 15s).
  actions?.fetch_directory_listing({ path });

  actions?.set_all_files_unchecked();
}

/** Resolve ".." segments in a relative path: "a/b/.." → "a", "a/.." → "" */
export function normalizeDotDot(path: string): string {
  if (!path.includes("..")) return path;
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "..") {
      parts.pop();
    } else if (seg !== "" && seg !== ".") {
      parts.push(seg);
    }
  }
  return parts.join("/");
}
