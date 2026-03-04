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
  pathKey: "explorer_browsing_path" | "flyout_browsing_path",
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

  actions?.setState({
    [pathKey]: path,
    [historyKey]: nextHistory,
    // Clear selection state — stale anchors / keyboard indices from the
    // previous directory would cause incorrect range/keyboard selections.
    most_recent_file_click: undefined,
    selected_file_index: undefined,
  } as any);

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
