/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { List, Map } from "immutable";
import type { SectionBlock } from "./types";

/**
 * Detect the heading level from a markdown cell's input.
 * Returns 1-4 for h1-h4, or 0 if no heading is found.
 */
function getHeadingLevel(input: string): number {
  const match = input.trimStart().match(/^(#{1,4})\s/);
  if (match) {
    return match[1].length;
  }
  return 0;
}

/**
 * Given a cell list and cells map, compute section blocks.
 *
 * A section block is a group of cells between two heading-markdown cells.
 * Cells before the first heading form an implicit block (headingLevel=0).
 */
export function computeSectionBlocks(
  cellList: List<string>,
  cells: Map<string, any>,
): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  let currentBlock: SectionBlock | null = null;

  cellList.forEach((id: string) => {
    const cell = cells.get(id);
    if (cell == null) return;

    const cellType = cell.get("cell_type") || "code";
    let headingLevel = 0;

    if (cellType === "markdown") {
      const input = cell.get("input") || "";
      headingLevel = getHeadingLevel(input);
    }

    if (headingLevel > 0) {
      if (currentBlock != null) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        startCellId: id,
        cellIds: [id],
        headingLevel,
      };
    } else {
      if (currentBlock == null) {
        currentBlock = {
          startCellId: id,
          cellIds: [id],
          headingLevel: 0,
        };
      } else {
        currentBlock.cellIds.push(id);
      }
    }
  });

  if (currentBlock != null) {
    blocks.push(currentBlock);
  }

  return blocks;
}

export interface BlockInfo {
  blockIndex: number;
  positionInBlock: number;
  blockSize: number;
}

/**
 * Build a lookup: cell ID → block info.
 * Used by the gutter to know which block a cell belongs to
 * and whether it's the first/last in its block.
 */
export function buildBlockLookup(
  blocks: SectionBlock[],
): globalThis.Map<string, BlockInfo> {
  const lookup = new globalThis.Map<string, BlockInfo>();
  blocks.forEach((block, blockIndex) => {
    block.cellIds.forEach((cellId, positionInBlock) => {
      lookup.set(cellId, {
        blockIndex,
        positionInBlock,
        blockSize: block.cellIds.length,
      });
    });
  });
  return lookup;
}
