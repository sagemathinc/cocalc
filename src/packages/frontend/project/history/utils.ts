/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "@cocalc/frontend/app-framework";
import type { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { filename_extension } from "@cocalc/util/misc";
import type { OpenFile } from "./types";

export function getOpenFilePath(
  filename: OpenFile["filename"] | unknown,
): string | undefined {
  // Delegates to `normalizeLogFilename` so plain string, plain object
  // `{path, …}`, and Immutable Map shapes (newer clients downgraded to
  // an older client via fromJS) are all handled identically.
  const path = normalizeLogFilename(filename);
  return path != null && path.length > 0 ? path : undefined;
}

export function getOpenFileExt(
  filename: OpenFile["filename"] | unknown,
): string {
  // Fast path: a pre-computed `.ext` from the newer client shape, on
  // either a plain object OR an Immutable Map.
  if (typeof filename === "object" && filename != null) {
    const asMap = filename as { get?: (k: string) => unknown };
    const ext =
      typeof asMap.get === "function"
        ? asMap.get("ext")
        : (filename as { ext?: unknown }).ext;
    if (typeof ext === "string" && ext.length > 0) {
      return ext.replace(/^\./, "").toLowerCase();
    }
  }
  const path = getOpenFilePath(filename);
  return path == null ? "" : filename_extension(path).toLowerCase();
}

/**
 * Coerce a project_log `event.filename` value to a string, accepting both
 * shapes the codebase has used:
 *
 *   - legacy: a plain string.
 *   - newer:  `{ ext, path, editorId }` (or an Immutable Map of the same
 *             after fromJS), in which case the real filename is `.path`.
 *
 * Older code paths called `.toLowerCase()` on the raw value; the moment
 * a project_log row written by a newer client lands in an older client
 * (cross-version downgrade — same browser session, switched git
 * branches, etc.), the call crashes. This helper is the canonical place
 * to coerce the value; future shape changes should be added here.
 *
 * Returns `undefined` when no usable string can be extracted. Pass an
 * empty-string fallback when you want to chain `.toLowerCase()` etc.
 * without nil-checking, via `normalizeLogFilename(value) ?? ""`.
 */
export function normalizeLogFilename(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw == null) return undefined;
  // Immutable Map: has a .get function returning the inner path.
  const asMap = raw as { get?: (k: string) => unknown };
  if (typeof asMap.get === "function") {
    const path = asMap.get("path");
    if (typeof path === "string") return path;
    return undefined;
  }
  // Plain object — likely from a path that bypassed fromJS.
  if (typeof raw === "object" && typeof (raw as any).path === "string") {
    return (raw as any).path;
  }
  return undefined;
}

/**
 * Convenience wrapper around `normalizeLogFilename` for the common case
 * of reading `event.filename` from an Immutable Map entry. Returns
 * `fallback` (default `undefined`) when the entry has no usable
 * filename. Pass `""` for chaining `.toLowerCase()` etc. without
 * nil-checks.
 */
export function getOpenEventFilename(
  entry: { getIn: (path: any[]) => any },
  fallback?: string,
): string | undefined {
  const fn = normalizeLogFilename(entry.getIn(["event", "filename"]));
  return fn ?? fallback;
}

// used when clicking/opening a file open entry in the project activity log and similar
export function handleFileEntryClick(
  e: React.MouseEvent | React.KeyboardEvent | undefined,
  path: string,
  project_id: string,
  fragmentId?: FragmentId,
): void {
  e?.preventDefault();
  const switch_to = should_open_in_foreground(e);
  redux.getProjectActions(project_id).open_file({
    path,
    foreground: switch_to,
    foreground_project: switch_to,
    fragmentId,
  });
}
