/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Utility functions for single-file view cell operations.

This module handles:
- Finding cells by line number
- Getting cell IDs at specific lines
- Finding cells that overlap with a line range
*/

import type { CellMapping } from "./state";

/**
 * Find which cell contains the given line number.
 */
export function findCellAtLine(
  mappings: CellMapping[],
  lineNumber: number,
): CellMapping | undefined {
  return mappings.find(
    (m) => lineNumber >= m.inputRange.from && lineNumber < m.inputRange.to,
  );
}

/**
 * Get the cell ID at a given line number.
 */
export function getCellIdAtLine(
  mappings: CellMapping[],
  lineNumber: number,
): string | undefined {
  return findCellAtLine(mappings, lineNumber)?.cellId;
}

/**
 * Get all cells that overlap with a given line range.
 */
export function getCellsInRange(
  mappings: CellMapping[],
  fromLine: number,
  toLine: number,
): CellMapping[] {
  return mappings.filter(
    (m) => m.inputRange.from < toLine && m.inputRange.to > fromLine,
  );
}

/**
 * Get all cells affected by the current cursor position or selection.
 * If there's a selection, returns all cells that overlap with the selection.
 * If just a cursor, returns the single cell at that line.
 */
export function getAffectedCellsFromSelection(
  mappings: CellMapping[],
  fromPos: number,
  toPos: number,
  doc: any, // EditorState.doc type
): CellMapping[] {
  // Convert positions to line numbers (0-indexed)
  const fromLine = doc.lineAt(fromPos).number - 1;
  const toLine = doc.lineAt(toPos).number - 1;

  if (fromLine === toLine) {
    // Single line - return the cell containing this line
    const cell = findCellAtLine(mappings, fromLine);
    return cell ? [cell] : [];
  } else {
    // Range of lines - return all cells in range
    return getCellsInRange(mappings, fromLine, toLine + 1);
  }
}

// Zero-Width Space (U+200B) - invisible marker for output widget placement
// This character is designed for marking/bookmarking text without visual display
export const ZERO_WIDTH_SPACE = "\u200b";
