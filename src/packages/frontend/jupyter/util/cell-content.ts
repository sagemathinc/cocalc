/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { CUTOFF } from "@cocalc/frontend/frame-editors/llm/consts";
import { backtickSequence } from "@cocalc/frontend/markdown/util";

export type CellDirection = "above" | "below" | "around";
export type CellCount = "none" | number | "all above" | "all below" | "all";

export interface CellContentOptions {
  actions: NotebookFrameActions | undefined;
  id: string;
  direction: CellDirection;
  cellCount: CellCount;
  cellTypes?: "all" | "code" | "markdown";
  lang?: string;
  aboveCount?: number; // For "around" direction
  belowCount?: number; // For "around" direction
}

export interface CellContextContent {
  before?: string;
  after?: string;
}

/**
 * Get content from nonempty cells in specified direction from a given cell
 */
export function getNonemptyCellContents({
  actions,
  id,
  direction,
  cellCount,
  cellTypes = "code",
  lang,
  aboveCount = 2,
  belowCount = 2,
}: CellContentOptions): CellContextContent {
  if (actions == null) return {};
  if (cellCount === "none" && direction !== "around") return {};

  const jupyterActionsStore = actions?.jupyter_actions.store;

  if (direction === "around") {
    const result: CellContextContent = {};

    if (aboveCount > 0) {
      const aboveContent = getDirectionalContent({
        actions,
        id,
        jupyterActionsStore,
        cellTypes,
        lang,
        direction: "above",
        count: aboveCount,
        includeCurrentCell: true,
      });
      if (aboveContent) result.before = aboveContent;
    }

    if (belowCount > 0) {
      const belowContent = getDirectionalContent({
        actions,
        id,
        jupyterActionsStore,
        cellTypes,
        lang,
        direction: "below",
        count: belowCount,
        includeCurrentCell: false,
      });
      if (belowContent) result.after = belowContent;
    }

    return result;
  }

  // Handle single direction - return in appropriate property
  const count =
    typeof cellCount === "number"
      ? cellCount
      : cellCount === "all above" ||
        cellCount === "all below" ||
        cellCount === "all"
      ? 100
      : 0;

  const content = getDirectionalContent({
    actions,
    id,
    jupyterActionsStore,
    cellTypes,
    lang,
    direction,
    count,
  });

  if (!content) return {};

  return direction === "above" ? { before: content } : { after: content };
}

function getDirectionalContent({
  actions,
  id,
  jupyterActionsStore,
  cellTypes,
  lang,
  direction,
  count,
  includeCurrentCell = false,
}: {
  actions: NotebookFrameActions;
  id: string;
  jupyterActionsStore: any;
  cellTypes: "all" | "code" | "markdown";
  lang?: string;
  direction: "above" | "below";
  count: number;
  includeCurrentCell?: boolean;
}): string {
  const cells: string[] = [];
  let length = 0;
  let delta = direction === "above" ? (includeCurrentCell ? 0 : -1) : 1;
  let remainingCount = count;

  while (remainingCount > 0) {
    const cellId = jupyterActionsStore.get_cell_id(delta, id);
    if (!cellId) break;

    const cell = actions.get_cell_by_id(cellId);
    if (!cell) break;

    const code = actions.get_cell_input(cellId)?.trim();
    const cellType = cell.get("cell_type", "code");

    if (code && (cellTypes === "all" || cellType === cellTypes)) {
      length += code.length;
      if (length > CUTOFF) break;

      const delim = backtickSequence(code);
      const formattedCode =
        cellTypes === "all" && cellType === "code"
          ? `${delim}${lang}\n${code}\n${delim}`
          : code;

      if (direction === "above") {
        cells.unshift(formattedCode);
      } else {
        cells.push(formattedCode);
      }

      remainingCount--;
    }

    delta += direction === "above" ? -1 : 1;
  }

  return cells.join("\n\n");
}
