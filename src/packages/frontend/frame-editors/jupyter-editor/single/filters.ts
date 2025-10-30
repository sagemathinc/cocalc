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

import { EditorState, Extension, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import type { CellMapping } from "./state";
import { ZERO_WIDTH_SPACE, getAffectedCellsFromSelection } from "./utils";

/**
 * Create a transaction filter that protects marker lines from deletion.
 * This prevents users from deleting output widget marker lines.
 */
export function createMarkerProtectionFilter(): Extension {
  return EditorState.changeFilter.of((tr: Transaction) => {
    // Scan the NEW document for actual ZWS marker lines
    // (don't trust mappingsRef, it becomes stale during editing)
    const protectedRanges: [number, number][] = [];
    const newDoc = tr.newDoc;

    for (let lineNum = 1; lineNum <= newDoc.lines; lineNum++) {
      const line = newDoc.line(lineNum);
      // Check if this line is a ZWS marker (entire line is just ZWS)
      if (line.text === ZERO_WIDTH_SPACE) {
        protectedRanges.push([line.from, line.to]);
      }
    }

    if (protectedRanges.length === 0) {
      return true; // No markers to protect
    }

    // Check if any change overlaps protected ranges
    let hasConflict = false;
    tr.changes.iterChanges(
      (_fromA: number, _toA: number, fromB: number, toB: number) => {
        if (hasConflict) return;

        for (const [start, end] of protectedRanges) {
          // Check if change in new document overlaps with protected range
          // fromB/toB are positions in the new document
          if (fromB < end && toB > start) {
            hasConflict = true;
            return;
          }
        }
      },
    );

    // If no conflicts, allow all changes
    if (!hasConflict) {
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
 * First flushes any pending edits, then executes the cells.
 */
export function createCellExecutionKeyHandler(
  mappingsRef: { current: CellMapping[] },
  actions: JupyterActions,
  flushChangesRef?: { current: () => void },
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

        return true; // Indicate we handled this event
      }

      return false; // Not our event
    },
  });
}
