/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare var DEBUG: boolean;

import { redux } from "@cocalc/frontend/app-framework";
import { isIntlMessage, type IntlMessage } from "@cocalc/frontend/i18n";

import type { FrameInfo } from "./build-tree";

export function resolveSpecLabel(
  label?: string | IntlMessage,
): string | undefined {
  if (!label) return undefined;
  if (typeof label === "string") {
    return label;
  }
  if (isIntlMessage(label)) {
    return label.defaultMessage ?? label.id;
  }
  return undefined;
}

export function ensureFrameFilePath(
  frames: FrameInfo[],
  fallbackPath?: string,
): FrameInfo[] {
  if (!fallbackPath) {
    return frames;
  }
  return frames.map((frame) =>
    frame.filePath
      ? frame
      : {
          ...frame,
          filePath: fallbackPath,
        },
  );
}

// TODO: replace this manual allowlist with editor-provided metadata once editor actions expose
// whether a frame can be focused via the CodeEditorActions.focus API. At the moment every editor
// inherits focus() from code-editor/actions.ts, which blindly tries to focus a CodeMirror instance
// for the requested frame id. Layouts like LaTeX output/PDF panels share the same actions object
// even though those frames have no CodeMirror, so calling focus() re-activates the previous text
// editor and causes key events (e.g., arrow keys) to keep scrolling the source. Since we have no
// per-frame capability flag, we maintain this “DOM-only” set and force those frames to rely on DOM
// focus instead. When editor specs start carrying something like `focusMode: "cm" | "dom"` this list
// should go away in favor of that canonical signal.
const DOM_ONLY_EDITOR_TYPES = new Set([
  "output",
  "pdf_embed",
  "pdfjs",
  "pdfjs_canvas",
  "build",
  "word_count",
  "latex_table_of_contents",
]);

interface FocusOptions {
  editorType?: string;
}

/**
 * Decide whether we should rely on the editor actions' focus() method for a frame.
 * TODO: detect this from frame/editor metadata instead of a hard-coded list.
 */
function shouldUseEditorFocus(editorType?: string): boolean {
  if (!editorType) {
    return true;
  }
  if (DOM_ONLY_EDITOR_TYPES.has(editorType)) {
    return false;
  }
  if (editorType.startsWith("pdf")) {
    return false;
  }
  if (editorType.endsWith("_preview")) {
    return false;
  }
  return true;
}

/**
 * Ensure a frame becomes active and focused after opening a file.
 *
 * 1. set_active_id so Redux knows which frame is active
 * 2. try editorActions.focus(frameId) if the frame supports editor focus
 * 3. fall back to DOM focus for passive frames
 * 4. retry while the editor actions are not yet available (file still opening)
 *
 * TODO: add cancellation (e.g., AbortController) so rapid navigation can stop retries.
 */
export function focusFrameWithRetry(
  targetProjectId: string,
  editorPath: string,
  frameId: string,
  attempt: number = 0,
  options?: FocusOptions,
): void {
  const editorActions = redux.getEditorActions(targetProjectId, editorPath);
  if (editorActions) {
    editorActions.set_active_id(frameId, false);

    const useEditorFocus = shouldUseEditorFocus(options?.editorType);
    const focusEditor = (): boolean => {
      if (!useEditorFocus) {
        return false;
      }
      const maybeFocus = (editorActions as any)?.focus;
      if (typeof maybeFocus === "function") {
        try {
          maybeFocus.call(editorActions, frameId);
          return true;
        } catch (err) {
          if (DEBUG) {
            console.log("Error focusing editor via actions", { frameId, err });
          }
        }
      }
      return false;
    };

    const focusDomFallback = (): boolean => {
      if (typeof document === "undefined") {
        return false;
      }
      const frameElement = document.querySelector(
        `[data-frame-id="${frameId}"]`,
      ) as HTMLElement | null;

      if (frameElement) {
        frameElement.focus();
        return true;
      } else if (DEBUG) {
        console.log("Frame element not found", { frameId });
      }
      return false;
    };

    setTimeout(() => {
      const handled = focusEditor();
      if (!handled) {
        focusDomFallback();
      }
    }, 50);

    return;
  }
  if (attempt < 15) {
    setTimeout(
      () =>
        focusFrameWithRetry(
          targetProjectId,
          editorPath,
          frameId,
          attempt + 1,
          options,
        ),
      100,
    );
  } else if (DEBUG) {
    console.log("Unable to focus frame (editor actions missing)", {
      targetProjectId,
      editorPath,
      frameId,
    });
  }
}
