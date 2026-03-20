/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Helper functions for the global file clipboard (cut/copy/paste).
// State lives on the "page" store as `file_clipboard`.
// Clipboard is fully independent of checkbox selections — visual
// indicators are driven by `useClipboardPathSet()` in the hooks.

import { redux } from "@cocalc/frontend/app-framework";
import type { PageState } from "@cocalc/frontend/app/store";
import { alert_message } from "@cocalc/frontend/alerts";
import { delete_files } from "@cocalc/frontend/project/delete-files";
import { get_array_range, path_split } from "@cocalc/util/misc";

export interface ClipboardEntry {
  project_id: string;
  path: string;
}

export type ClipboardMode = "copy" | "cut";

export interface FileClipboard {
  mode: ClipboardMode;
  files: ClipboardEntry[];
}

function getClipboard(): FileClipboard | undefined {
  const raw = redux.getStore("page")?.get("file_clipboard");
  if (raw == null) return undefined;
  // The store wraps plain objects in immutable Maps
  return typeof raw.toJS === "function"
    ? raw.toJS()
    : (raw as unknown as FileClipboard);
}

function setClipboard(clipboard: FileClipboard | undefined): void {
  redux
    .getActions("page")
    .setState({ file_clipboard: clipboard } as Partial<PageState>);
}

/** Signal that a file action completed for a specific project.
 *  Only that project's explorer/flyout will flush their deferred listing. */
export function signalFileAction(project_id: string): void {
  const store = redux.getStore("page");
  const prev = store?.get("file_action_signal") as
    | { seq: number }
    | undefined;
  const seq = (prev?.seq ?? 0) + 1;
  redux
    .getActions("page")
    .setState({
      file_action_signal: { project_id, seq },
    } as Partial<PageState>);
}

function sameEntry(a: ClipboardEntry, b: ClipboardEntry): boolean {
  return a.project_id === b.project_id && a.path === b.path;
}


/** Shared implementation for addToCopy and addToCut.
 *  Clipboard is fully independent of checkbox selections. */
function addToClipboard(
  project_id: string,
  path: string,
  mode: ClipboardMode,
): void {
  const clip = getClipboard();
  const otherMode: ClipboardMode = mode === "copy" ? "cut" : "copy";
  const entry: ClipboardEntry = { project_id, path };

  if (!clip || clip.mode === otherMode) {
    // Switching mode — start fresh with just this file
    setClipboard({ mode, files: [entry] });
  } else {
    // Accumulate (deduped)
    if (clip.files.some((f) => sameEntry(f, entry))) return;
    setClipboard({ mode, files: [...clip.files, entry] });
  }
}

/** Add a range of files to the clipboard (shift-click).
 *  Uses `most_recent_file_click` from the project store as the range anchor.
 *  Caller must provide the listing of full paths (since explorer and flyout
 *  have independent listings with different sort/filter). */
export function addRangeToClipboard(
  project_id: string,
  path: string,
  mode: ClipboardMode,
  /** Full paths of the currently displayed listing, in display order. */
  listingPaths: string[],
): void {
  const store = redux.getProjectStore(project_id);
  if (!store) return addToClipboard(project_id, path, mode);

  const mostRecent = store.get("most_recent_file_click");
  if (!mostRecent || listingPaths.length === 0) {
    return addToClipboard(project_id, path, mode);
  }

  const range = get_array_range(listingPaths, mostRecent, path);

  // Ensure clipboard is in the right mode
  const clip = getClipboard();
  const otherMode: ClipboardMode = mode === "copy" ? "cut" : "copy";
  if (clip && clip.mode === otherMode) {
    setClipboard({ mode, files: [] });
  }

  for (const p of range) {
    addToClipboard(project_id, p, mode);
  }

  redux.getProjectActions(project_id)?.set_most_recent_file_click(path);
}

/** Add files to the copy queue. Merges with all currently checked files
 *  in the same project. If currently in "cut" mode, clears and switches. */
export function addToCopy(project_id: string, path: string): void {
  addToClipboard(project_id, path, "copy");
}

/** Add files to the cut queue. Merges with all currently checked files
 *  in the same project. If currently in "copy" mode, clears and switches. */
export function addToCut(project_id: string, path: string): void {
  addToClipboard(project_id, path, "cut");
}

/** Remove a single file from the clipboard. */
export function removeFile(project_id: string, path: string): void {
  const clip = getClipboard();
  if (!clip) return;
  const files = clip.files.filter(
    (f) => !sameEntry(f, { project_id, path }),
  );
  if (files.length === 0) {
    setClipboard(undefined);
  } else {
    setClipboard({ ...clip, files });
  }
}

/** Remove multiple files from the clipboard (e.g. after deletion). */
export function removeFiles(entries: ClipboardEntry[]): void {
  const clip = getClipboard();
  if (!clip) return;
  const removeSet = new Set(entries.map((e) => `${e.project_id}:${e.path}`));
  const files = clip.files.filter(
    (f) => !removeSet.has(`${f.project_id}:${f.path}`),
  );
  if (files.length === 0) {
    setClipboard(undefined);
  } else {
    setClipboard({ ...clip, files });
  }
}

/** Clear the clipboard entirely. */
export function clear(): void {
  setClipboard(undefined);
}

/** Execute the paste operation into the target directory.
 *  - Copy mode: copies files, clipboard cleared (unless keepClipboard).
 *  - Cut mode (same project): moves files, clipboard cleared.
 *  - Cut mode (cross-project): copies first, then deletes source. */
export async function pasteHere(
  target_project_id: string,
  target_path: string,
  keepClipboard?: boolean,
): Promise<void> {
  const clip = getClipboard();
  if (!clip || clip.files.length === 0) return;

  // Block same-directory paste only in copy mode (cut = move is a harmless no-op)
  if (clip.mode === "copy") {
    const allInSameDir = clip.files.every((f) => {
      if (f.project_id !== target_project_id) return false;
      return path_split(f.path).head === target_path;
    });
    if (allInSameDir) {
      alert_message({
        type: "info",
        message:
          "Cannot paste here — files are already in this directory. Use duplicate instead.",
      });
      return;
    }
  }

  // Group files by source project_id
  const byProject = new Map<string, string[]>();
  for (const { project_id, path } of clip.files) {
    const paths = byProject.get(project_id) ?? [];
    paths.push(path);
    byProject.set(project_id, paths);
  }

  // Phase 1: perform all copy/move operations
  const crossProjectSources: Array<{
    project_id: string;
    paths: string[];
  }> = [];
  let canceled = false;

  for (const [src_project_id, src_paths] of byProject) {
    const targetActions = redux.getProjectActions(target_project_id);
    if (!targetActions) continue;

    if (src_project_id === target_project_id) {
      // Same project
      if (clip.mode === "cut") {
        // move_files returns false when user cancels the start-project prompt
        const ok = await targetActions.move_files({
          src: src_paths,
          dest: target_path,
        });
        if (!ok) {
          canceled = true;
          break;
        }
      } else {
        await targetActions.copy_paths({ src: src_paths, dest: target_path });
      }
    } else {
      // Cross-project: always copy first
      await targetActions.copy_paths_between_projects({
        src_project_id,
        src: src_paths,
        target_project_id,
        target_path,
      });
      if (clip.mode === "cut") {
        crossProjectSources.push({
          project_id: src_project_id,
          paths: src_paths,
        });
      }
    }
  }

  // If the user canceled (e.g. declined start-project prompt), keep clipboard intact
  if (canceled) return;

  // Phase 2: for cut mode, delete cross-project sources AFTER all copies succeeded.
  // Use ProjectActions.delete_files() for full side effects (activity logging, etc.)
  let deleteFailed = false;
  for (const { project_id, paths } of crossProjectSources) {
    const srcActions = redux.getProjectActions(project_id);
    if (srcActions) {
      const ok = await srcActions.delete_files({ paths });
      if (!ok) deleteFailed = true;
    } else {
      await delete_files(project_id, paths);
    }
  }
  if (deleteFailed) {
    alert_message({
      type: "warning",
      message:
        "Files were copied but could not be deleted from the source project. The originals remain in place.",
    });
  }

  // Refresh listing in target directory
  redux
    .getProjectActions(target_project_id)
    ?.fetch_directory_listing({ path: target_path });

  // For cut mode, refresh ALL unique source directories
  if (clip.mode === "cut") {
    for (const [src_project_id, src_paths] of byProject) {
      const srcDirs = new Set(src_paths.map((p) => path_split(p).head));
      for (const dir of srcDirs) {
        redux
          .getProjectActions(src_project_id)
          ?.fetch_directory_listing({ path: dir });
      }
    }
  }

  // Signal file action to flush deferred listing gates for affected projects
  signalFileAction(target_project_id);
  for (const [src_project_id] of byProject) {
    if (src_project_id !== target_project_id) {
      signalFileAction(src_project_id);
    }
  }

  // Clear clipboard. For copy mode, shift-click keeps the clipboard.
  if (clip.mode === "cut" || !keepClipboard) {
    clear();
  }
}
