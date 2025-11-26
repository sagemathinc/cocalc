/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import type { CellMergeEffectValue } from "./filters";

function combineContent(
  source: string,
  target: string,
  isAtEnd: boolean,
): string {
  const needsNewline = source !== "" && target !== "" ? "\n" : "";
  if (isAtEnd) {
    return `${source}${needsNewline}${target}`;
  }
  return `${target}${needsNewline}${source}`;
}

/**
 * Apply a cell merge effect to the Jupyter store/actions.
 * Clears outputs/exec-counts on the surviving cell since its input changes substantially.
 */
export function applyCellMergeEffect(
  actions: JupyterActions,
  effect: CellMergeEffectValue,
): void {
  const store: any = actions.store;
  const cells = store?.get("cells");
  if (!cells) return;

  const targetCell = cells.get(effect.targetCellId);
  if (!targetCell) return;

  const sourceCell = cells.get(effect.sourceCellId);
  if (!sourceCell) return;

  const targetContent: string = targetCell.get("input") ?? "";
  const mergedContent = combineContent(
    effect.sourceContent,
    targetContent,
    effect.isAtEnd,
  );

  // Outputs and exec count are no longer valid after merging drastically different inputs.
  actions.clear_outputs([effect.targetCellId]);
  actions.set_cell_input(effect.targetCellId, mergedContent, true);
  actions.delete_cells([effect.sourceCellId]);
}

export type { CellMergeEffectValue } from "./filters";
