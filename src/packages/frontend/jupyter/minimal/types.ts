/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export type CellViewMode = "default" | "minimal";

export interface SectionBlock {
  /** Cell ID that starts this block (the heading markdown cell, or first cell for the implicit block) */
  startCellId: string;
  /** All cell IDs in this block, in order */
  cellIds: string[];
  /** Heading level (1-4) or 0 for the implicit first block */
  headingLevel: number;
}
