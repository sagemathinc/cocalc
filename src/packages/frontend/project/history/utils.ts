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
  if (typeof filename === "string") {
    return filename.length > 0 ? filename : undefined;
  }
  if (typeof filename !== "object" || filename == null) {
    return undefined;
  }
  const path = (filename as { path?: unknown }).path;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

export function getOpenFileExt(
  filename: OpenFile["filename"] | unknown,
): string {
  if (typeof filename === "object" && filename != null) {
    const ext = (filename as { ext?: unknown }).ext;
    if (typeof ext === "string" && ext.length > 0) {
      return ext.replace(/^\./, "").toLowerCase();
    }
  }
  const path = getOpenFilePath(filename);
  return path == null ? "" : filename_extension(path).toLowerCase();
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
