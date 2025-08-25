/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { CUTOFF } from "@cocalc/frontend/frame-editors/llm/consts";
import { backtickSequence } from "@cocalc/frontend/markdown/util";

export interface CellContentOptions {
  actions: NotebookFrameActions | undefined;
  id: string;
  cellTypes?: "all" | "code" | "markdown";
  lang?: string;
  aboveCount?: number; // For "around" direction
  belowCount?: number; // For "around" direction
  includeCurrentCellInAbove?: boolean; // if true, the "above" includes the current cell
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
  cellTypes = "code",
  lang,
  aboveCount = 2,
  belowCount = 2,
  includeCurrentCellInAbove = false,
}: CellContentOptions): CellContextContent {
  if (actions == null) return {};

  const jupyterActionsStore = actions?.jupyter_actions.store;

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
      includeCurrentCell: includeCurrentCellInAbove,
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
