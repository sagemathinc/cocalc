/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Output marker protection for single-file view.

This module handles:
- Protecting marker lines from user deletion
- Keyboard shortcuts for cell execution (Shift+Return)
*/

import {
  EditorState,
  Extension,
  StateEffect,
  Transaction,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import type { CellMapping } from "./state";
import {
  ZERO_WIDTH_SPACE,
  findCellAtLine,
  getAffectedCellsFromSelection,
  getCellsInRange,
} from "./utils";

/**
 * Create a transaction filter that protects marker lines from deletion.
 * This prevents users from deleting output widget marker lines.
 */
export function createMarkerProtectionFilter(): Extension {
  return EditorState.changeFilter.of((tr: Transaction) => {
    // Only protect markers from USER edits (input/delete)
    // Allow programmatic changes from store sync (full document rebuilds)
    const isUserEvent = tr.isUserEvent("input") || tr.isUserEvent("delete");

    if (!isUserEvent) {
      return true; // Allow store-sync changes through
    }

    // CRITICAL: Scan the OLD document (tr.state.doc) for markers, not the new one!
    // If a marker is being deleted, it won't exist in tr.newDoc anymore.
    // We need to find it in the old document and protect it.
    const protectedRanges: [number, number][] = [];
    const oldDoc = tr.state.doc;

    for (let lineNum = 1; lineNum <= oldDoc.lines; lineNum++) {
      const line = oldDoc.line(lineNum);
      // Check if this line is a ZWS marker (ZWS + optional letter c/m/r)
      if (line.text.startsWith(ZERO_WIDTH_SPACE) && line.text.length <= 2) {
        protectedRanges.push([line.from, line.to]);
      }
    }

    if (protectedRanges.length === 0) {
      return true; // No markers to protect
    }

    // Check if any change overlaps protected ranges in OLD document
    // But allow deletions that remove entire marker lines (boundary deletions)
    let hasPartialConflict = false;
    tr.changes.iterChanges(
      (fromA: number, toA: number, _fromB: number, _toB: number) => {
        if (hasPartialConflict) return;

        for (const [start, end] of protectedRanges) {
          // Check if this change touches a marker
          if (fromA < end && toA > start) {
            // Check if this is a COMPLETE marker line deletion (boundary operation)
            // If deletion covers entire marker line, allow it - merge filter will handle it
            const deletesEntireMarkerLine = fromA <= start && toA >= end;

            if (deletesEntireMarkerLine) {
              continue; // Allow - merge filter is handling this
            }

            // But block partial edits that corrupt markers
            hasPartialConflict = true;
            return;
          }
        }
      },
    );

    // If no conflicts, allow all changes
    if (!hasPartialConflict) {
      return true;
    }

    // If conflicts, return flattened protected ranges to suppress them
    const flatRanges: number[] = [];
    for (const [start, end] of protectedRanges) {
      flatRanges.push(start, end);
    }
    return flatRanges;
  });
}

/**
 * Create a keyboard handler extension for Shift+Return (execute cell).
 * When user presses Shift+Return, executes all cells that contain or overlap with the cursor/selection.
 * First flushes any pending edits, then executes the cells, and signals store listener to move cursor to next cell.
 */
export function createCellExecutionKeyHandler(
  mappingsRef: { current: CellMapping[] },
  actions: JupyterActions,
  flushChangesRef?: { current: () => void },
  cursorTargetRef?: { current: string | null },
): Extension {
  return EditorView.domEventHandlers({
    keydown: (event: KeyboardEvent, view: EditorView) => {
      // Check for Shift+Return (Enter)
      if (event.shiftKey && (event.key === "Enter" || event.code === "Enter")) {
        event.preventDefault();

        // First, flush any pending changes to ensure the current edits are saved
        if (flushChangesRef?.current) {
          flushChangesRef.current();
        }

        // Get the current selection or cursor position
        const state = view.state;
        const { from, to } = state.selection.main;
        const doc = state.doc;

        // Get affected cells based on cursor/selection
        const affectedCells = getAffectedCellsFromSelection(
          mappingsRef.current,
          from,
          to,
          doc,
        );

        // Execute each affected cell
        for (const cell of affectedCells) {
          actions.run_cell(cell.cellId);
        }

        // Signal store listener where to move cursor after execution
        // Store listener will move cursor after document rebuild
        if (affectedCells.length > 0 && cursorTargetRef) {
          // Find the last affected cell in the mappings by cellId
          const lastAffectedCell = affectedCells[affectedCells.length - 1];
          const lastCellIndex = mappingsRef.current.findIndex(
            (m) => m.cellId === lastAffectedCell.cellId,
          );

          if (
            lastCellIndex !== -1 &&
            lastCellIndex < mappingsRef.current.length - 1
          ) {
            // There's a next cell - signal store listener to move there
            const nextCell = mappingsRef.current[lastCellIndex + 1];
            cursorTargetRef.current = nextCell.cellId;
          } else if (lastCellIndex === mappingsRef.current.length - 1) {
            // We're at the last cell - insert a new cell and signal store listener to move to it
            const newCellId = actions.insert_cell_adjacent(
              lastAffectedCell.cellId,
              1,
            );
            // Store listener will move cursor to this new cell once it appears in mappings
            cursorTargetRef.current = newCellId;
          }
        }

        return true; // Indicate we handled this event
      }

      return false; // Not our event
    },
  });
}

/**
 * StateEffect to signal that cells should be merged.
 * When a user deletes at cell boundaries, this effect triggers the merge operation.
 */
export interface CellMergeEffectValue {
  sourceCellId: string; // Cell to merge from (being deleted)
  targetCellId: string; // Cell to merge into (being kept)
  sourceContent: string; // Content of source cell (for merging into target)
  isAtEnd: boolean; // true if deletion was at end of cell, false if at start
}

export const cellMergeEffect = StateEffect.define<CellMergeEffectValue>();

/**
 * StateEffect to signal range deletions across multiple cells.
 * When user selects and deletes content spanning multiple cells.
 */
export const rangeDeletionEffect = StateEffect.define<
  | {
      type: "delete";
      cellId: string; // Cell to completely remove
    }
  | {
      type: "modify";
      cellId: string; // Cell to modify
      newContent: string; // Remaining content after deletion
    }
>();

/**
 * Create a transaction filter that detects cell boundary deletions and triggers merging.
 *
 * Behavior:
 * - Delete at end of cell (last line): merge with next cell
 * - Backspace at start of cell (first line): merge with previous cell
 * - Last cell: just remove the marker line if deleting at end
 *
 * Note: Merging for markdown/raw cells is not supported since they don't have
 * source lines in the document (only marker lines).
 */
export function createCellMergingFilter(
  mappingsRef: { current: CellMapping[] },
  _actions: JupyterActions, // Reserved for future use when handling merge operations in store
): Extension {
  return EditorState.transactionFilter.of((tr: Transaction) => {
    // Only process if there are actual changes
    if (!tr.docChanged) {
      return tr;
    }

    // Skip store-sync and non-user transactions (document rebuilds)
    // Only process actual user deletions
    if (!tr.isUserEvent("delete") && !tr.isUserEvent("input")) {
      return tr;
    }

    // Check if this is a single character deletion (backspace or delete key)
    const oldDoc = tr.startState.doc;
    let isCharDeletion = false;
    let deletionPosInOld = -1; // Position in OLD doc where deletion started
    let deletedText: string | null = null;

    tr.changes.iterChanges(
      (fromA: number, toA: number, fromB: number, toB: number) => {
        // Check if this is a deletion (size decreased)
        const deletedLength = toA - fromA;

        if (deletedLength > 0 && toB === fromB) {
          // Something was deleted
          if (deletedLength === 1) {
            // Single character deleted
            isCharDeletion = true;
            deletionPosInOld = fromA; // Position in old doc where deleted char started
            deletedText = oldDoc.sliceString(fromA, toA);
          }
        }
      },
    );

    // Ignore single-character deletions that don't remove the newline
    // separating two cells. Only newline deletions should trigger merging.
    if (isCharDeletion && deletedText !== "\n") {
      return tr;
    }

    // Also check for multi-character boundary deletions (e.g., newline + marker)
    // These should be treated as merge operations
    let isBoundaryDeletion = isCharDeletion;

    if (!isCharDeletion) {
      // Check if this could be a boundary deletion including a marker
      // Pattern: deleting from cell content through the newline and marker
      tr.changes.iterChanges((fromA: number, toA: number) => {
        const deletedLength = toA - fromA;
        const deletedText = oldDoc.sliceString(fromA, toA);

        // Check if this looks like a newline + marker deletion
        // Pattern: ends with newline + ZWS + char, or starts with char + newline + ZWS
        if (
          deletedLength >= 2 &&
          deletedText.includes("\n") &&
          deletedText.includes("\u200b")
        ) {
          isBoundaryDeletion = true;
          deletionPosInOld = fromA;
        }
      });
    }

    if (!isBoundaryDeletion) {
      return tr;
    }

    const referencePosRaw =
      deletedText === "\n" && deletionPosInOld > 0
        ? deletionPosInOld - 1
        : deletionPosInOld;
    const clampedReferencePos = Math.max(
      0,
      Math.min(referencePosRaw, oldDoc.length > 0 ? oldDoc.length - 1 : 0),
    );
    const referencePos =
      oldDoc.length === 0
        ? 0
        : Math.min(clampedReferencePos, oldDoc.length - 1);
    const referenceLine = oldDoc.lineAt(referencePos);
    let lineNumber = referenceLine.number - 1; // 0-indexed

    // Find which cell this deletion is in - use old doc line to be safe
    let cell = findCellAtLine(mappingsRef.current, lineNumber);
    if (!cell && lineNumber + 1 < oldDoc.lines) {
      // Try line after deletion (for newline before next cell)
      const nextLineNumber = lineNumber + 1;
      const nextCell = findCellAtLine(mappingsRef.current, nextLineNumber);
      if (nextCell) {
        cell = nextCell;
        lineNumber = nextLineNumber;
      }
    }
    if (!cell && lineNumber > 0) {
      // If still not found, map to previous line
      lineNumber -= 1;
      cell = findCellAtLine(mappingsRef.current, lineNumber);
    }

    if (!cell) {
      return tr; // Not in any cell, skip
    }

    // Skip markdown and raw cells - they can't merge the same way
    if (cell.cellType !== "code") {
      return tr;
    }

    // Determine if we're at a cell boundary
    const isAtStartLine = lineNumber === cell.inputRange.from;
    const isAtEndLine = lineNumber === cell.inputRange.to - 1;

    if (!isAtStartLine && !isAtEndLine) {
      // Not at boundary line, allow normal deletion
      return tr;
    }

    // Check if deletion is actually at line boundary in the OLD document
    // This is the only reliable way to know if we're truly at a cell boundary
    const oldLine = oldDoc.line(lineNumber + 1); // 1-indexed
    const oldLineStartPos = oldLine.from;
    const oldLineEndPos = oldLine.to;
    const posInOldLine = referencePos - oldLineStartPos;
    const isDeletingNewline = deletedText === "\n";

    // For isAtStart: deletion at position 0 (backspace at first char of line)
    // For isAtEnd: deletion at the very end of line (delete at last char of line)
    const isAtStart =
      isAtStartLine &&
      (posInOldLine === 0 ||
        deletionPosInOld === oldLineStartPos ||
        (isDeletingNewline && deletionPosInOld + 1 === oldLineStartPos));
    const isAtEnd =
      isAtEndLine &&
      (deletionPosInOld === oldLineEndPos - 1 ||
        (isDeletingNewline && deletionPosInOld === oldLineEndPos));

    const isAtActualBoundary = isAtStart || isAtEnd;

    if (!isAtActualBoundary) {
      // Deletion is within the line, not at actual cell boundary - allow normal deletion
      return tr;
    }

    // Now we know it's a true boundary deletion
    // Determine merge target
    const cellIndex = mappingsRef.current.indexOf(cell);
    if (cellIndex === -1) {
      return tr;
    }

    let targetCell: CellMapping | undefined;
    let sourceCell: CellMapping = cell;

    if (isAtEnd && cellIndex < mappingsRef.current.length - 1) {
      // Delete at end: merge with next cell
      targetCell = mappingsRef.current[cellIndex + 1];
    } else if (isAtStart && cellIndex > 0) {
      // Backspace at start: merge with previous cell
      // In this case, we merge current cell INTO the previous cell
      targetCell = mappingsRef.current[cellIndex - 1];
      sourceCell = cell;
    }

    if (!targetCell) {
      // No cell to merge with (at end of last cell), just allow deletion
      return tr;
    }

    // Merge is happening - dispatch effect to handle in store listener
    // CRITICAL: Extract source content from the actual document, but ONLY the part that remains
    // If we're deleting at a boundary, we need to exclude what's being deleted

    // First, get the full cell content
    const sourceLines: string[] = [];
    for (
      let lineNum = sourceCell.inputRange.from;
      lineNum < sourceCell.inputRange.to;
      lineNum++
    ) {
      if (lineNum + 1 <= oldDoc.lines) {
        sourceLines.push(oldDoc.line(lineNum + 1).text);
      }
    }

    // Now check if the deletion happened within this cell's content
    // If so, we should only extract the part BEFORE the deletion
    let sourceContent = sourceLines.join("\n");

    // Check if deletion is at the end of the cell (within the last line's content)
    if (isAtEnd && sourceLines.length > 0) {
      const lastLine = sourceLines[sourceLines.length - 1];
      const lastLineNum = sourceCell.inputRange.to - 1;
      const lastLineStartInDoc = oldDoc.line(lastLineNum + 1).from;

      // How far into the last line does the deletion start?
      const deletionStartInLine = deletionPosInOld - lastLineStartInDoc;

      if (deletionStartInLine > 0 && deletionStartInLine < lastLine.length) {
        // Deletion is mid-line - keep only content before deletion
        const contentBeforeDeletion = lastLine.substring(
          0,
          deletionStartInLine,
        );
        sourceLines[sourceLines.length - 1] = contentBeforeDeletion;
        sourceContent = sourceLines.join("\n");
      }
    }

    if (isAtStart && sourceLines.length > 0) {
      const firstLine = sourceLines[0];
      const firstLineNum = sourceCell.inputRange.from;
      const firstLineStartInDoc = oldDoc.line(firstLineNum + 1).from;

      const deletionStartInLine = deletionPosInOld - firstLineStartInDoc;

      if (deletionStartInLine > 0 && deletionStartInLine < firstLine.length) {
        // Deletion is mid-line - keep only content after deletion
        const contentAfterDeletion = firstLine.substring(deletionStartInLine);
        sourceLines[0] = contentAfterDeletion;
        sourceContent = sourceLines.join("\n");
      }
    }

    const mergeEffect = cellMergeEffect.of({
      sourceCellId: sourceCell.cellId,
      targetCellId: targetCell.cellId,
      sourceContent: sourceContent,
      isAtEnd: isAtEnd,
    });

    return {
      ...tr,
      effects: tr.effects.concat(mergeEffect),
    };
  });
}

/**
 * Create a transaction filter that detects range deletions across multiple cells.
 *
 * When user selects and deletes content spanning one or more cells:
 * - Cells completely within selection are deleted
 * - Cells partially in selection are modified to keep non-selected content
 *
 * Behavior:
 * - Selection spans one cell: modify that cell
 * - Selection spans multiple cells: delete intermediate cells, modify start/end cells
 * - Selection deletes entire cells: remove those cells from notebook
 */
export function createRangeDeletionFilter(
  mappingsRef: { current: CellMapping[] },
  _actions: JupyterActions,
): Extension {
  return EditorState.transactionFilter.of((tr: Transaction) => {
    const oldDoc = tr.state.doc;

    // Skip if no changes
    if (!tr.docChanged) {
      return tr;
    }

    // Skip store-sync and non-user transactions (document rebuilds)
    // Only process actual user deletions
    if (!tr.isUserEvent("delete") && !tr.isUserEvent("input")) {
      return tr;
    }

    // Collect all deletion ranges and check if this is a multi-character deletion
    let totalDeletedLength = 0;
    const deletionRanges: Array<[number, number]> = [];

    tr.changes.iterChanges((fromA, toA, fromB, toB) => {
      const deletedLength = toA - fromA;
      totalDeletedLength += deletedLength;

      if (deletedLength > 0 && toB === fromB) {
        // This is a deletion (insert position in new doc == deletion position in old doc)
        // Store deletion positions in OLD document coordinates (fromA, toA)
        deletionRanges.push([fromA, toA]);
      }
    });

    // Only handle range deletions (multi-character or spans multiple lines)
    // Single-character deletions are handled by cell merging filter
    if (totalDeletedLength <= 1) {
      return tr;
    }

    // Get the line range affected by the deletion
    let minAffectedLine = oldDoc.lines;
    let maxAffectedLine = 0;

    tr.changes.iterChanges((fromA, toA) => {
      if (toA > fromA) {
        // Bounds check: ensure positions are valid in oldDoc
        // This prevents crashes from race conditions where store sync modifies document
        if (fromA < 0 || toA > oldDoc.length) {
          return;
        }
        const fromLine = oldDoc.lineAt(fromA).number - 1; // 0-indexed
        const toLine = oldDoc.lineAt(Math.max(1, toA - 1)).number - 1; // 0-indexed
        minAffectedLine = Math.min(minAffectedLine, fromLine);
        maxAffectedLine = Math.max(maxAffectedLine, toLine);
      }
    });

    // Find all cells that overlap with affected lines
    const affectedCells = getCellsInRange(
      mappingsRef.current,
      minAffectedLine,
      maxAffectedLine + 1,
    );

    if (affectedCells.length === 0) {
      return tr;
    }

    // Determine which cells to delete and which to modify
    const cellsToDelete: string[] = [];
    const cellsToModify: Array<{ cellId: string; newContent: string }> = [];

    for (const cell of affectedCells) {
      // Only process code cells (skip markdown/raw)
      if (cell.cellType !== "code") {
        continue;
      }

      // Get the character position range of this cell's input in oldDoc
      const inputStartLine = cell.inputRange.from;
      const inputEndLine = cell.inputRange.to; // exclusive

      const cellStartPos = oldDoc.line(inputStartLine + 1).from;
      const cellEndPos =
        inputEndLine < oldDoc.lines
          ? oldDoc.line(inputEndLine + 1).from
          : oldDoc.length;

      // Check if any deletion overlaps with this cell
      let totalCellDeletion = 0; // How much of the cell's content was deleted
      let cellHasOverlap = false;

      for (const [delStart, delEnd] of deletionRanges) {
        // Check if this deletion overlaps with the cell
        if (delStart < cellEndPos && delEnd > cellStartPos) {
          cellHasOverlap = true;
          // Calculate how much of the cell was deleted
          const overlapStart = Math.max(delStart, cellStartPos);
          const overlapEnd = Math.min(delEnd, cellEndPos);
          totalCellDeletion += overlapEnd - overlapStart;
        }
      }

      if (!cellHasOverlap) {
        // Cell not affected by deletion
        continue;
      }

      // Get the cell's original content from oldDoc
      const oldContent = oldDoc.sliceString(cellStartPos, cellEndPos);

      // Apply deletions to calculate remaining content
      let newContent = oldContent;
      for (const [delStart, delEnd] of deletionRanges) {
        if (delStart < cellEndPos && delEnd > cellStartPos) {
          // Calculate relative positions within the cell
          const relativeStart = Math.max(0, delStart - cellStartPos);
          const relativeEnd = Math.min(
            newContent.length,
            delEnd - cellStartPos,
          );
          // Remove the deleted part
          newContent =
            newContent.substring(0, relativeStart) +
            newContent.substring(relativeEnd);
        }
      }

      // Decide action based on remaining content
      if (newContent === "" || newContent.trim() === "") {
        // Entire cell was deleted
        cellsToDelete.push(cell.cellId);
      } else {
        // Cell was partially deleted, keep remaining content
        cellsToModify.push({ cellId: cell.cellId, newContent });
      }
    }

    // If no cells affected, allow the deletion
    if (cellsToDelete.length === 0 && cellsToModify.length === 0) {
      return tr;
    }

    // Dispatch effects for cell operations
    let effects = tr.effects;

    for (const cellId of cellsToDelete) {
      effects = effects.concat(
        rangeDeletionEffect.of({
          type: "delete",
          cellId,
        }),
      );
    }

    for (const { cellId, newContent } of cellsToModify) {
      effects = effects.concat(
        rangeDeletionEffect.of({
          type: "modify",
          cellId,
          newContent,
        }),
      );
    }

    return {
      ...tr,
      effects,
    };
  });
}

/**
 * Information about a cell that was pasted into the document
 */
export interface PastedCell {
  cellType: "code" | "markdown" | "raw";
  content: string;
  // Position in cell_list where this cell should be inserted
  position: number;
}

/**
 * StateEffect to signal that cells have been pasted into the document.
 * When user pastes content with ZWS markers (multi-cell selection),
 * this effect carries information about which cells were created.
 */
export const pasteDetectionEffect = StateEffect.define<PastedCell[]>();

/**
 * Helper to scan a document for ZWS markers and return their positions and types.
 * Returns array of { lineNum, markerType } for each marker found.
 */
function scanMarkersInDocument(
  doc: any,
): Array<{ lineNum: number; markerType: "c" | "m" | "r" }> {
  const markers: Array<{ lineNum: number; markerType: "c" | "m" | "r" }> = [];

  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    const line = doc.line(lineNum);
    if (line.text.startsWith(ZERO_WIDTH_SPACE) && line.text.length <= 2) {
      // Line is a marker: ZWS + optional type letter
      const markerType = (line.text.length === 2 ? line.text[1] : "c") as
        | "c"
        | "m"
        | "r";
      markers.push({ lineNum: lineNum - 1, markerType }); // Convert to 0-indexed
    }
  }

  return markers;
}

/**
 * Create a transaction filter that detects pasted multi-cell content.
 *
 * When user pastes content with ZWS markers:
 * 1. Detects character insertions
 * 2. Scans for new ZWS markers in the document
 * 3. Compares old markers with new markers to find newly pasted cells
 * 4. Extracts content and cell type for each pasted cell
 * 5. Dispatches pasteDetectionEffect with cell creation info
 *
 * Note: This filter only triggers on paste-like operations (large insertions with markers).
 * Single-character edits are handled by merge/range deletion filters.
 */
export function createPasteDetectionFilter(
  _mappingsRef: { current: CellMapping[] }, // Reserved for future use
  _actions: JupyterActions, // Reserved for future use
): Extension {
  return EditorState.transactionFilter.of((tr: Transaction) => {
    const oldDoc = tr.state.doc;
    const newDoc = tr.newDoc;

    // Only process if document changed
    if (!tr.docChanged) {
      return tr;
    }

    // Scan both documents for markers
    const oldMarkers = scanMarkersInDocument(oldDoc);
    const newMarkers = scanMarkersInDocument(newDoc);

    // Determine which markers are new (pasted)
    // A marker is new if it's not at a position we've seen before
    const newCells: PastedCell[] = [];

    for (const newMarker of newMarkers) {
      // Check if this marker position matches any old marker
      const isExistingMarker = oldMarkers.some(
        (oldMarker) => oldMarker.lineNum === newMarker.lineNum,
      );

      if (!isExistingMarker) {
        // This is a newly pasted marker
        // Skip markdown cells (they have markers but no content)
        if (newMarker.markerType === "m") {
          continue; // User wanted to ignore markdown for now
        }

        // Extract content for this cell (from line after previous marker to this marker)
        const startLine =
          newMarker.lineNum > 0
            ? (newMarkers
                .filter((m) => m.lineNum < newMarker.lineNum)
                .map((m) => m.lineNum)
                .pop() ?? -1)
            : -1;

        const contentLines: string[] = [];
        for (
          let lineNum = startLine + 1;
          lineNum < newMarker.lineNum;
          lineNum++
        ) {
          if (lineNum >= 0 && lineNum + 1 <= newDoc.lines) {
            contentLines.push(newDoc.line(lineNum + 1).text);
          }
        }

        // Join lines and remove trailing whitespace
        const content = contentLines.join("\n");

        // Only create cell if it has content (skip empty cells from pure marker pastes)
        if (content.trim() !== "") {
          newCells.push({
            cellType: newMarker.markerType === "r" ? "raw" : "code",
            content: content,
            position: newMarkers.indexOf(newMarker), // Position in marker order
          });
        }
      }
    }

    // If cells were pasted, dispatch effect
    if (newCells.length > 0) {
      return {
        ...tr,
        effects: tr.effects.concat(pasteDetectionEffect.of(newCells)),
      };
    }

    return tr;
  });
}
