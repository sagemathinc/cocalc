/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Custom gutter for Jupyter single-file view.

Displays two columns:
1. Cell labels: In[N] (blue) for input cells, Out[N] (red) for output cells
2. Input line numbers: Sequential numbering (1, 2, 3, ...) for input lines only

The gutter properly handles the cell-to-line mapping without counting
invisible output marker lines.
*/

import { Extension, RangeSet } from "@codemirror/state";
import { GutterMarker, gutter } from "@codemirror/view";

import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import type { CellMapping, CellState } from "./state";

interface LineMarker {
  cellId: string; // Unique cell identifier
  cellType: "code" | "markdown" | "raw"; // Cell type
  cellLabel: string; // "In[1]", "Md", "Raw", etc.
  inputLineNum: number; // 1-based for input, 0 for output markers
  isFirstLineOfCell: boolean; // Show label only on first line
  isOutputMarker: boolean;
  outLabel?: string; // "Out[1]" - shown on output marker line for code cells only
  hasOutputs: boolean; // Whether this cell has outputs
  cellState?: CellState; // Cell execution state
}

/**
 * Build a map of document line numbers to their cell labels and line numbers.
 */
function buildLineMarkers(mappings: CellMapping[]): Map<number, LineMarker> {
  const markers = new Map<number, LineMarker>();
  let consecutiveInputLineNum = 1;

  mappings.forEach((mapping) => {
    const {
      cellType,
      cellId,
      outputMarkerLine,
      inputRange,
      execCount,
      state,
      outputs,
    } = mapping;
    const hasOutputs = (outputs?.length ?? 0) > 0;

    // Generate cell label based on type
    let cellLabel: string;
    let outLabel: string | undefined;

    if (cellType === "code") {
      // Code cell: show In[N] or In[ ] for unexecuted cells
      const cellNum = execCount;
      if (cellNum != null) {
        cellLabel = `In[${cellNum}]`;
      } else {
        // Cell not yet executed: show placeholder space instead of fallback to line number
        cellLabel = "In[ ]";
      }
      // Show Out[N] on last line for code cells that have been executed (have execCount)
      // BUT only if the cell is not currently running/queued (to avoid overlap with In[N])
      const isRunning =
        state === "busy" || state === "run" || state === "start";
      outLabel =
        execCount != null && !isRunning ? `Out[${execCount}]` : undefined;
    } else if (cellType === "markdown") {
      // Markdown cell: show "Md"
      cellLabel = "MD";
      outLabel = undefined; // Markdown cells don't have outputs
    } else {
      // Raw cell: show "Raw"
      cellLabel = "Raw";
      outLabel = undefined; // Raw cells don't have outputs
    }

    // Mark all input lines
    for (let line = inputRange.from; line < inputRange.to; line++) {
      const lineInCell = line - inputRange.from + 1;
      const isLastLine = line === inputRange.to - 1;

      markers.set(line, {
        cellId,
        cellType,
        cellLabel,
        inputLineNum: consecutiveInputLineNum, // Consecutive numbering, skipping output markers
        isFirstLineOfCell: lineInCell === 1,
        isOutputMarker: false,
        // Show Out[N] on the last input line of code cells that have been executed
        outLabel: isLastLine ? outLabel : undefined,
        hasOutputs,
        cellState: state,
      });
      consecutiveInputLineNum++;
    }

    // Mark the output marker line (still needed for positioning output widgets)
    // Show Out[N] for cells that have been executed (have execCount)
    markers.set(outputMarkerLine, {
      cellId,
      cellType,
      cellLabel,
      inputLineNum: 0,
      isFirstLineOfCell: true,
      isOutputMarker: true,
      outLabel, // Show Out[N] on output marker line if cell has been executed
      hasOutputs,
      cellState: state,
    });
  });

  return markers;
}

/**
 * Create gutter with In[N]/Out[N] labels and consecutive line numbers.
 * Output marker lines are skipped (they contain invisible ZWS characters).
 */
export function createCellGutterWithLabels(
  mappingsRef: {
    current: CellMapping[];
  },
  actions?: JupyterActions,
): Extension {
  return gutter({
    class: "jupyter-cell-gutter",
    markers(view) {
      const markers: Array<[number, GutterMarker]> = [];
      const lineMarkers = buildLineMarkers(mappingsRef.current);
      const docLines = view.state.doc.lines;

      lineMarkers.forEach((marker, lineNum) => {
        // For output marker lines, always show gutter entry to account for:
        // 1. Output widgets (for cells with outputs)
        // 2. Insert cell widget (appears below every cell's output marker)
        if (marker.isOutputMarker) {
          // Continue - we need gutter space for insert cell widget even if no outputs
        }

        try {
          if (lineNum + 1 > docLines) {
            return;
          }

          const line = view.state.doc.line(lineNum + 1);
          const gutterMarker = new CellLabelMarker(
            marker.cellId,
            marker.cellType,
            marker.cellLabel,
            marker.inputLineNum,
            marker.isFirstLineOfCell,
            marker.outLabel,
            marker.hasOutputs,
            marker.cellState,
            actions,
            marker.isOutputMarker, // Pass flag to indicate this is an output marker
          );
          markers.push([line.from, gutterMarker]);
        } catch {
          // Line might not exist
        }
      });

      return RangeSet.of(
        markers.map(([pos, marker]) => marker.range(pos)),
        true,
      );
    },
  });
}

/**
 * Gutter marker showing cell label (In[N]/Out[N]) and line number side-by-side.
 * Shows Out[N] labels on the last input line for all cells, including those without outputs.
 * Also shows a vertical line indicator for cell execution state.
 *
 * When a cell is running, the In[N] label becomes an interactive button to stop execution.
 * When a cell is not running, the In[N] label becomes a button to run the cell.
 */
class CellLabelMarker extends GutterMarker {
  constructor(
    readonly cellId: string,
    readonly cellType: "code" | "markdown" | "raw",
    readonly label: string,
    readonly lineNum: number,
    readonly isFirst: boolean,
    readonly outLabel?: string,
    readonly hasOutputs?: boolean,
    readonly cellState?: CellState,
    readonly actions?: JupyterActions,
    readonly isOutputMarker: boolean = false,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    // Special handling for output marker lines
    // These lines are invisible (ZWS) but get replaced by the OutputWidget
    // which now includes both the outputs AND the insert cell widget
    if (this.isOutputMarker) {
      const wrapper = document.createElement("div");
      wrapper.className = "jupyter-cell-label-wrapper";
      wrapper.setAttribute("data-cell-id", this.cellId);

      // For output marker lines, show Out[N] label if cell has outputs
      if (this.outLabel) {
        const outRow = document.createElement("div");
        outRow.className = "jupyter-cell-label-row";

        const outSpan = document.createElement("span");
        outSpan.textContent = this.outLabel;
        outSpan.className = "jupyter-cell-out-label";

        const spacer = document.createElement("span");
        spacer.className = "jupyter-cell-line-spacer";

        outRow.appendChild(outSpan);
        outRow.appendChild(spacer);
        wrapper.appendChild(outRow);
      }

      return wrapper;
    }

    // Normal input line handling
    const wrapper = document.createElement("div");
    wrapper.className = "jupyter-cell-label-wrapper";
    wrapper.setAttribute("data-cell-id", this.cellId);

    // Add state indicator class for CSS styling (only for code cells)
    // "busy" and "start" = actively running
    // "run" = queued (waiting for another cell)
    if (this.cellType === "code") {
      if (this.cellState === "busy" || this.cellState === "start") {
        wrapper.classList.add("cell-state-running");
      } else if (this.cellState === "run") {
        wrapper.classList.add("cell-state-queued");
      }
    }

    // Top row: Cell label and line number
    const topRow = document.createElement("div");
    topRow.className = "jupyter-cell-label-row";

    // Cell label - becomes a button only for code cells
    if (this.isFirst) {
      // For code cells, show interactive button; for others, show plain label
      if (this.cellType === "code") {
        const labelButton = document.createElement("button");
        labelButton.className = "jupyter-cell-in-label-button";
        labelButton.title = this.getButtonTooltip();
        labelButton.setAttribute("data-cell-id", this.cellId);

        // Mark as inactive if cell is not running/queued
        const isActive =
          this.cellState === "run" ||
          this.cellState === "busy" ||
          this.cellState === "start";
        if (!isActive) {
          labelButton.classList.add("jupyter-cell-in-label-inactive");
        }

        // Create container for label with icon
        const labelContainer = document.createElement("div");
        labelContainer.className = "jupyter-cell-in-label-content";

        if (isActive) {
          // Running/Queued: Show "In[<utf8 char>]"
          const inLabel = document.createElement("span");
          inLabel.textContent = "In[";
          inLabel.className = "jupyter-cell-in-bracket";

          // Active state icon (▶ or ⏳)
          const activeCharSpan = document.createElement("span");
          activeCharSpan.className =
            "jupyter-cell-in-char jupyter-cell-in-char-active";
          activeCharSpan.textContent = this.getActiveChar();

          // Stop icon on hover (⏹ - BLACK SQUARE FOR STOP)
          const stopCharSpan = document.createElement("span");
          stopCharSpan.className =
            "jupyter-cell-in-char jupyter-cell-in-char-stop";
          stopCharSpan.textContent = "⏹";

          const closeLabel = document.createElement("span");
          closeLabel.textContent = "]";
          closeLabel.className = "jupyter-cell-in-bracket";

          labelContainer.appendChild(inLabel);
          labelContainer.appendChild(activeCharSpan);
          labelContainer.appendChild(stopCharSpan);
          labelContainer.appendChild(closeLabel);
        } else {
          // Inactive: Show "In[number]" normally, "In[▶]" on hover
          // Regular text version
          const textSpan = document.createElement("span");
          textSpan.className = "jupyter-cell-in-text";
          textSpan.textContent = this.label;

          // UTF8 char version (hidden until hover)
          const charSpan = document.createElement("span");
          charSpan.className = "jupyter-cell-in-char-hover";

          const inLabel = document.createElement("span");
          inLabel.textContent = "In[";

          const char = document.createElement("span");
          char.textContent = "▶";

          const closeLabel = document.createElement("span");
          closeLabel.textContent = "]";

          charSpan.appendChild(inLabel);
          charSpan.appendChild(char);
          charSpan.appendChild(closeLabel);

          labelContainer.appendChild(textSpan);
          labelContainer.appendChild(charSpan);
        }

        labelButton.appendChild(labelContainer);

        // Add click handler
        labelButton.addEventListener("click", (e) => {
          e.preventDefault();
          this.handleButtonClick();
        });

        topRow.appendChild(labelButton);
      } else {
        // For markdown/raw cells, show plain text label
        const labelSpan = document.createElement("span");
        labelSpan.textContent = this.label;
        labelSpan.className = "jupyter-cell-label-text";
        topRow.appendChild(labelSpan);
      }
    } else {
      const labelSpan = document.createElement("span");
      labelSpan.textContent = "";
      labelSpan.className = "jupyter-cell-in-label";
      topRow.appendChild(labelSpan);
    }

    // Line number
    const numSpan = document.createElement("span");
    numSpan.textContent = String(this.lineNum);
    numSpan.className = "jupyter-cell-line-number";

    topRow.appendChild(numSpan);
    wrapper.appendChild(topRow);

    // Bottom row: Out[N] label (if present)
    if (this.outLabel) {
      const bottomRow = document.createElement("div");
      bottomRow.className = "jupyter-cell-label-row";

      const outSpan = document.createElement("span");
      outSpan.textContent = this.outLabel;
      outSpan.className = "jupyter-cell-out-label";

      // Empty spacer for line number column alignment
      const spacer = document.createElement("span");
      spacer.className = "jupyter-cell-line-spacer";

      bottomRow.appendChild(outSpan);
      bottomRow.appendChild(spacer);
      wrapper.appendChild(bottomRow);
    }

    return wrapper;
  }

  private getActiveChar(): string {
    if (this.cellState === "run") {
      return "⏳"; // Hourglass for queued
    }
    return "▶"; // Play triangle for running
  }

  private getButtonTooltip(): string {
    if (this.cellState === "run") {
      return "Cell is queued. Click to stop execution.";
    } else if (this.cellState === "busy" || this.cellState === "start") {
      return "Cell is running. Click to stop execution.";
    }
    return "Click to run this cell (Ctrl+Return)";
  }

  private handleButtonClick(): void {
    if (!this.actions) return;

    if (
      this.cellState === "run" ||
      this.cellState === "busy" ||
      this.cellState === "start"
    ) {
      // Stop execution
      this.actions.signal("SIGINT");
    } else {
      // Run this cell
      this.actions.run_cell(this.cellId);
    }
  }

  eq(other: CellLabelMarker): boolean {
    // Important: cellState is checked because it affects whether we show icon or text
    // Also check isOutputMarker because it changes what we render (output marker vs input line)
    return (
      other.cellId === this.cellId &&
      other.cellType === this.cellType &&
      other.label === this.label &&
      other.lineNum === this.lineNum &&
      other.isFirst === this.isFirst &&
      other.outLabel === this.outLabel &&
      other.hasOutputs === this.hasOutputs &&
      other.cellState === this.cellState &&
      other.isOutputMarker === this.isOutputMarker
    );
  }
}
