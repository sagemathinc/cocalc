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
  position?: "above" | "below"; // Where new cell will be inserted (for ai-cell-generator)
  direction: CellDirection;
  cellCount: CellCount;
  cellTypes?: "all" | "code" | "markdown";
  lang?: string;
  aboveCount?: number; // For "around" direction
  belowCount?: number; // For "around" direction
}

/**
 * Get content from nonempty cells in specified direction from a given cell
 */
export function getNonemptyCellContents({
  actions,
  id,
  position,
  direction,
  cellCount,
  cellTypes = "code",
  lang,
  aboveCount = 2,
  belowCount = 2,
}: CellContentOptions): string {
  if (actions == null) return "";
  if (cellCount === "none" && direction !== "around") return "";
  
  const jupyterActionsStore = actions?.jupyter_actions.store;
  
  if (direction === "around") {
    const aboveContent = getDirectionalContent({
      actions,
      id,
      jupyterActionsStore,
      cellTypes,
      lang,
      direction: "above",
      count: aboveCount,
    });
    
    const belowContent = getDirectionalContent({
      actions,
      id,
      jupyterActionsStore,
      cellTypes,
      lang,
      direction: "below",
      count: belowCount,
    });
    
    return [aboveContent, belowContent].filter(Boolean).join("\n\n");
  }
  
  // Handle backward compatibility for ai-cell-generator
  if (position !== undefined) {
    const start = position === "below" ? 0 : -1;
    return getDirectionalContentLegacy({
      actions,
      id,
      jupyterActionsStore,
      cellTypes,
      lang,
      start,
      count: cellCount,
    });
  }
  
  // Handle single direction
  const count = typeof cellCount === "number" ? cellCount : 
                cellCount === "all above" || cellCount === "all below" || cellCount === "all" ? 100 : 0;
  
  return getDirectionalContent({
    actions,
    id,
    jupyterActionsStore,
    cellTypes,
    lang,
    direction,
    count,
  });
}

function getDirectionalContent({
  actions,
  id,
  jupyterActionsStore,
  cellTypes,
  lang,
  direction,
  count,
}: {
  actions: NotebookFrameActions;
  id: string;
  jupyterActionsStore: any;
  cellTypes: "all" | "code" | "markdown";
  lang?: string;
  direction: "above" | "below";
  count: number;
}): string {
  const cells: string[] = [];
  let length = 0;
  let delta = direction === "above" ? -1 : 1;
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
      const formattedCode = cellTypes === "all" && cellType === "code"
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

function getDirectionalContentLegacy({
  actions,
  id,
  jupyterActionsStore,
  cellTypes,
  lang,
  start,
  count,
}: {
  actions: NotebookFrameActions;
  id: string;
  jupyterActionsStore: any;
  cellTypes: "all" | "code" | "markdown";
  lang?: string;
  start: number;
  count: CellCount;
}): string {
  let delta: number = start;
  const cells: string[] = [];
  let length = 0;
  let prevCells = count;

  while (true) {
    const prevId = jupyterActionsStore.get_cell_id(delta, id);
    if (!prevId) break;
    const prevCell = actions.get_cell_by_id(prevId);
    if (!prevCell) break;
    const code = actions.get_cell_input(prevId)?.trim();
    const cellType = prevCell.get("cell_type", "code");
    if (code && (cellTypes === "all" || cellType === cellTypes)) {
      // we found a cell of given type
      length += code.length;
      if (length > CUTOFF) break;
      const delim = backtickSequence(code);
      cells.unshift(
        cellTypes === "all" && cellType === "code"
          ? `${delim}${lang}\n${code}\n${delim}`
          : code,
      );
      if (typeof prevCells === "number") {
        prevCells -= 1;
        if (prevCells <= 0) break;
      }
    }
    delta -= 1;
  }
  return cells.join("\n\n");
}

// Export the original function for backward compatibility
export function getPreviousNonemptyCellContents(
  actions: NotebookFrameActions | undefined,
  id: string,
  position,
  prevCells: CellCount,
  cellTypes: "all" | "code" | "markdown" = "code",
  lang?,
): string {
  return getNonemptyCellContents({
    actions,
    id,
    position,
    direction: "above",
    cellCount: prevCells,
    cellTypes,
    lang,
  });
}