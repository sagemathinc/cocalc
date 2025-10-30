/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
State management for single-file view.

This module handles:
- Building the CodeMirror document from notebook cells
- Maintaining cell-to-line mappings
- Tracking cell metadata and outputs for rendering
*/

import type { List, Map } from "immutable";
import { ZERO_WIDTH_SPACE } from "./utils";

/**
 * Cell execution state
 * - "busy": Currently executing code
 * - "run": Queued/waiting for another cell to finish
 * - "start": Sending to be evaluated
 * - undefined: Idle (done or never run)
 */
export type CellState = "busy" | "run" | "start" | undefined;

export interface CellMapping {
  cellId: string;
  cellType: "code" | "markdown" | "raw";
  inputRange: {
    from: number; // line number (0-indexed)
    to: number;
  };
  // Line number of the ZWS marker (invisible output placeholder)
  outputMarkerLine: number;
  // Source code lines
  source: string[];
  // Cell execution count (for In[N]/Out[N] labels)
  execCount?: number;
  // Cell metadata
  metadata?: Record<string, any>;
  // Cell outputs (for rendering)
  outputs?: any[];
  // Cell execution state
  state?: CellState;
  // Position where insert-cell widget appears: always "below" this cell
  position: "below";
}

export interface DocumentData {
  content: string;
  mappings: CellMapping[];
}

/**
 * Build the CodeMirror document content and cell mappings from notebook cells.
 *
 * The document structure is:
 * - Each cell's input source lines
 * - A single invisible Zero-Width Space (U+200B) marker line after each cell
 *   This line will be replaced by CodeMirror decoration with output widgets
 *
 * Example document:
 * ```
 * print('hello')
 * ⁠                    ← Zero-Width Space (invisible)
 * print('world')
 * ⁠                    ← Zero-Width Space (invisible)
 * ```
 */
export function buildDocumentFromNotebook(
  cells: Map<string, any>,
  cellList: List<string>,
): DocumentData {
  const lines: string[] = [];
  const mappings: CellMapping[] = [];

  let currentLine = 0;

  for (const cellId of cellList) {
    const cell = cells.get(cellId);
    if (!cell) continue;

    // CoCalc uses "input" for cell code (not "source" like Jupyter)
    const cellType = "code"; // CoCalc cells are always code cells in this context
    const inputData = cell.get("input") ?? "";
    const outputData = cell.get("output");
    const execCount = cell.get("exec_count");
    const cellState = cell.get("state");

    // Convert input string to array of lines
    // Even empty cells must have at least one line so they display a line number
    let sourceLines: string[] = [];
    if (typeof inputData === "string") {
      sourceLines = inputData === "" ? [""] : inputData.split("\n");
    }

    // Extract outputs from the output object
    // CoCalc output format: Immutable Map with numeric string keys ("0", "1", etc.)
    // Each message has properties like: {data: {...}, name: "stdout"/"stderr", text: "...", traceback: [...], etc.}
    const outputs: any[] = [];
    if (outputData) {
      // outputData is an Immutable Map with numeric string keys
      // Iterate through numeric keys in order
      let outputIndex = 0;
      while (true) {
        const message = outputData.get(`${outputIndex}`);
        if (!message) break;

        // Convert Immutable message to plain object
        const plainMessage = message.toJS?.() ?? message;
        outputs.push(plainMessage);
        outputIndex += 1;
      }
    }

    // Input range: from current line to current + source lines
    const inputRange = {
      from: currentLine,
      to: currentLine + sourceLines.length,
    };

    // Record the marker line number before adding marker
    const outputMarkerLine = currentLine + sourceLines.length;

    // Create the cell mapping
    mappings.push({
      cellId,
      cellType,
      inputRange,
      outputMarkerLine,
      source: sourceLines,
      execCount,
      metadata: { exec_count: execCount },
      outputs,
      state: cellState,
      position: "below", // Insert cell widget appears below this cell
    });

    // Add source lines to the document
    lines.push(...sourceLines);
    currentLine += sourceLines.length;

    // Add invisible marker line (Zero-Width Space character)
    // This line will be replaced by CodeMirror decoration with output widget
    lines.push(ZERO_WIDTH_SPACE);
    currentLine += 1;
  }

  const content = lines.join("\n");

  return {
    content,
    mappings,
  };
}
