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
  localInputs?: Record<string, string[]>,
): DocumentData {
  const lines: string[] = [];
  const mappings: CellMapping[] = [];

  let currentLine = 0;

  for (const cellId of cellList) {
    const cell = cells.get(cellId);
    if (!cell) continue;

    // Read actual cell type from notebook data
    const cellType = cell.get("cell_type") ?? "code";
    const inputData = cell.get("input") ?? "";
    const outputData = cell.get("output");
    const execCount = cell.get("exec_count");
    const cellState = cell.get("state");

    // Convert input string to array of lines
    // Even empty cells must have at least one line so they display a line number
    // CRITICAL: If localInputs is provided for this cell, use those instead (unsynced edits)
    let sourceLines: string[] = [];
    if (localInputs && cellId in localInputs) {
      sourceLines = localInputs[cellId] ?? [""];
    } else if (typeof inputData === "string") {
      sourceLines = inputData === "" ? [""] : inputData.split("\n");
    }

    // DEFENSIVE: Strip any ZWS characters from source lines
    // If a cell somehow contains marker characters, remove them to prevent duplication
    sourceLines = sourceLines.map((line) => {
      if (line.includes(ZERO_WIDTH_SPACE)) {
        const cleaned = line.replace(/\u200b/g, "");
        return cleaned;
      }
      return line;
    });

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

    // For code and raw cells: add source lines to document
    // For markdown cells: do NOT add source lines (only add marker with widget)
    let inputRange;
    let outputMarkerLine;

    if (cellType !== "markdown") {
      // Code/raw cells: source lines + marker
      inputRange = {
        from: currentLine,
        to: currentLine + sourceLines.length,
      };
      outputMarkerLine = currentLine + sourceLines.length;
      lines.push(...sourceLines);
      currentLine += sourceLines.length;
    } else {
      // Markdown cells: only marker, no source lines in document
      inputRange = { from: currentLine, to: currentLine };
      outputMarkerLine = currentLine;
    }

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

    // Add type-specific marker line (Zero-Width Space + type character)
    // This line will be replaced by CodeMirror decoration with appropriate widget
    // c = code cell (output widget)
    // m = markdown cell (markdown widget)
    // r = raw cell (raw widget)
    const markerChar =
      cellType === "markdown" ? "m" : cellType === "raw" ? "r" : "c";
    const marker = `${ZERO_WIDTH_SPACE}${markerChar}`;
    lines.push(marker);
    currentLine += 1;
  }

  const content = lines.join("\n");

  return {
    content,
    mappings,
  };
}
