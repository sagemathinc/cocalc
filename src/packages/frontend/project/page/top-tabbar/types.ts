/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { TypedMap } from "@cocalc/frontend/app-framework";
import { IconName } from "@cocalc/frontend/components";

export interface TopBarAction {
  label: string;
  hoverText?: string;
  priority?: number; // default 0
  icon: IconName;
  action?: (any) => any; // captures a static action
  getAction?: (
    local_view_state?: TypedMap<{ active_id?: string; full_id?: string }>,
  ) => any; // for dynamic actions
}

export type TopBarActions = TopBarAction[];

import type { ChatActions } from "@cocalc/frontend/chat/actions";
import type { CourseActions } from "@cocalc/frontend/course/actions";
import type { ArchiveActions } from "@cocalc/frontend/editors/archive/actions";
import type { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import type { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import type { TimeTravelActions } from "@cocalc/frontend/frame-editors/time-travel-editor/actions";

// All possible Actions of files. TODO: should they have a common parent?!
export type EditorActions =
  | JupyterEditorActions
  | ArchiveActions
  | CodeEditorActions
  | ChatActions
  | CourseActions
  | TimeTravelActions;

export interface TopBarConfig {
  shareInExtra: boolean;
}
