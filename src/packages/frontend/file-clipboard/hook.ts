/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useMemo, useRef } from "react";

import { useRedux } from "@cocalc/frontend/app-framework";

import type { ClipboardEntry, ClipboardMode, FileClipboard } from "./actions";
import {
  addToCopy,
  addToCut,
  clear,
  pasteHere,
  removeFile,
  removeFiles,
} from "./actions";

export { removeFiles as removeFilesFromClipboard };

const EMPTY_SET: Set<string> = new Set();

export interface FileClipboardHook {
  mode: ClipboardMode | undefined;
  files: ClipboardEntry[];
  addToCopy: (project_id: string, path: string) => void;
  addToCut: (project_id: string, path: string) => void;
  removeFile: (project_id: string, path: string) => void;
  clear: () => void;
  pasteHere: (target_project_id: string, target_path: string) => Promise<void>;
  isInClipboard: (project_id: string, path: string) => boolean;
}

/** Whether the clipboard is currently active (has files from any project). */
export function useHasClipboard(): boolean {
  const raw = useRedux("page", "file_clipboard");
  return !!(raw?.get?.("files")?.size > 0);
}

/** The current clipboard mode, or undefined if empty. */
export function useClipboardMode(): ClipboardMode | undefined {
  const raw = useRedux("page", "file_clipboard");
  return raw?.get?.("mode") as ClipboardMode | undefined;
}

/** Build a Set of clipboard paths for a specific project.
 *  Used for rendering: row highlighting and persistent button visibility. */
export function useClipboardPathSet(project_id: string): Set<string> {
  const raw = useRedux("page", "file_clipboard");
  return useMemo(() => {
    if (!raw) return EMPTY_SET;
    const clipboard: FileClipboard | undefined = raw?.toJS?.() ?? raw;
    if (!clipboard?.files?.length) return EMPTY_SET;
    return new Set(
      clipboard.files
        .filter((f: ClipboardEntry) => f.project_id === project_id)
        .map((f: ClipboardEntry) => f.path),
    );
  }, [raw, project_id]);
}

export function useFileClipboard(): FileClipboardHook {
  const raw = useRedux("page", "file_clipboard");

  return useMemo(() => {
    const clipboard: FileClipboard | undefined = raw?.toJS?.() ?? raw;
    const mode = clipboard?.mode;
    const files = clipboard?.files ?? [];
    const pathSet = new Set(
      files.map((f) => `${f.project_id}:${f.path}`),
    );

    return {
      mode,
      files,
      addToCopy,
      addToCut,
      removeFile,
      clear,
      pasteHere,
      isInClipboard: (project_id: string, path: string) =>
        pathSet.has(`${project_id}:${path}`),
    };
  }, [raw]);
}

/** Flush the deferred listing gate after a file action in this project.
 *  Watches `page.file_action_signal` — project-scoped, so only the
 *  affected project's explorer/flyout flushes. */
export function useFlushListingOnFileAction(
  project_id: string,
  allowNextUpdate: () => void,
): void {
  const raw = useRedux("page", "file_action_signal");
  const signal = raw?.toJS?.() ?? raw;
  const prevSeqRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (
      signal != null &&
      signal.project_id === project_id &&
      prevSeqRef.current !== signal.seq
    ) {
      allowNextUpdate();
    }
    prevSeqRef.current = signal?.seq;
  }, [signal, project_id, allowNextUpdate]);
}
