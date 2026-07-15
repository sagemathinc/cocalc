/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuItems } from "@cocalc/frontend/components/dropdown-menu";

/**
 * Data registered by the active frame's title bar for the top-tabbar
 * actions dropdown. Contains pre-built antd MenuItems (from
 * ManageCommands.menuItem) plus the toolbar button names for DnD reorder.
 */
export interface TopBarActionsData {
  /** Antd menu items, already fully resolved (labels, icons, children, stayOpenOnClick keys). */
  menuItems: MenuItems;
  /** Toolbar button names in display order — used for DnD reordering. */
  buttonNames: string[];
  /** Persist a new toolbar order after DnD. */
  onReorder: (newOrder: string[]) => void;
}

import type { ChatActions } from "@cocalc/frontend/chat/actions";
import type { CourseActions } from "@cocalc/frontend/course/actions";
import type { ArchiveActions } from "@cocalc/frontend/editors/archive/actions";
import type { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import type { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import type { TimeTravelActions } from "@cocalc/frontend/frame-editors/time-travel-editor/actions";

/** Methods that the top-tabbar may call on any editor actions instance. */
export interface TopBarCapableActions {
  getTopBarActionsData?(): TopBarActionsData | null;
  setTopBarActionsData?(data: TopBarActionsData | null): void;
  name: string;
}

// All possible Actions of files.
export type EditorActions =
  | JupyterEditorActions
  | ArchiveActions
  | CodeEditorActions
  | ChatActions
  | CourseActions
  | TimeTravelActions;
