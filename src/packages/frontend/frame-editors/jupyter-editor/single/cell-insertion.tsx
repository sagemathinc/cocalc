/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Insert cell widgets for allowing users to insert new cells between existing cells.

This module handles:
- Creating widget decorations for InsertCell components
- Rendering InsertCell at "above" and "below" positions
- Managing React component lifecycle within CodeMirror widgets
*/

import { RangeSet, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { createRoot, Root } from "react-dom/client";

import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import type { CellMapping } from "./state";

import { InsertCell } from "@cocalc/frontend/jupyter/insert-cell";

export interface InsertCellWidgetContext {
  actions: JupyterActions;
  project_id?: string;
  llmTools?: any;
  onInsertCell?: (
    cellId: string,
    type: "code" | "markdown",
    position: "above" | "below",
  ) => void;
}

/**
 * Widget that renders the InsertCell component in the editor.
 * This allows users to insert new cells below each cell's output marker.
 * Renders below each cell output with reduced opacity, increases on hover.
 */
export class InsertCellWidgetType extends WidgetType {
  private roots: Root[] = [];

  constructor(
    private cellId: string,
    private position: "above" | "below",
    private context: InsertCellWidgetContext,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "jupyter-insert-cell-widget";
    container.style.width = "100%";
    // Height for single-file view (smaller than default)
    container.style.height = "14px";

    // Render the InsertCell component
    const root = createRoot(container);
    root.render(
      <InsertCell
        id={this.cellId}
        position={this.position}
        actions={this.context.actions}
        project_id={this.context.project_id}
        llmTools={this.context.llmTools}
        mode="single"
        onInsertCell={this.context.onInsertCell}
        showAICellGen={null}
        setShowAICellGen={() => {}}
        alwaysShow={false}
      />,
    );
    this.roots.push(root);

    return container;
  }

  destroy(): void {
    // Clean up React roots when the widget is destroyed
    queueMicrotask(() => {
      for (const root of this.roots) {
        try {
          root.unmount();
        } catch (e) {
          console.warn("[InsertCellWidget] Error during unmount:", e);
        }
      }
      this.roots = [];
    });
  }

  ignoreEvent(): boolean {
    return false; // Allow events to bubble (needed for button clicks)
  }

  eq(other: InsertCellWidgetType): boolean {
    return other.cellId === this.cellId && other.position === this.position;
  }
}

/**
 * Build insert-cell widget decorations from cell mappings.
 * Creates decorations for "below" each cell's output marker.
 *
 * Note: We need the document to convert line numbers to character positions,
 * so this is called from within the StateField where we have access to the doc.
 *
 * Includes bounds checking to handle cases where lines may have been deleted.
 */
export function buildInsertCellDecorations(
  mappings: CellMapping[],
  context: InsertCellWidgetContext,
  doc: any, // EditorState.doc type
): Array<ReturnType<Decoration["range"]>> {
  const decorations: Array<ReturnType<Decoration["range"]>> = [];

  // Add insert cell below each cell's output marker
  for (const mapping of mappings) {
    const { cellId, outputMarkerLine } = mapping;

    // Bounds check: ensure line exists before trying to access it
    if (outputMarkerLine + 1 > doc.lines) {
      // Line doesn't exist (probably deleted), skip this decoration
      continue;
    }

    // Convert 0-indexed line number to character position
    const line = doc.line(outputMarkerLine + 1); // +1 for 1-indexed
    const charPos = line.to; // Use 'to' to place after the line

    // Create widget decoration for inserting below this cell
    // IMPORTANT: block: true is needed to make the widget take up vertical space
    // and actually render. Without it, the widget may not be displayed.
    const decoration = Decoration.widget({
      widget: new InsertCellWidgetType(cellId, "below", context),
      block: true, // Make it a block-level widget that takes up space
      side: 1,
    });

    // CRITICAL FIX: range() needs TWO arguments: from and to
    // For a zero-width widget, both should be the same position
    decorations.push(decoration.range(charPos, charPos));
  }

  return decorations;
}

/**
 * Create a StateField for managing insert-cell decorations.
 * Automatically recomputes when mappings change.
 */
export function createInsertCellDecorationsField(
  mappingsRef: {
    current: CellMapping[];
  },
  context: InsertCellWidgetContext,
): StateField<RangeSet<Decoration>> {
  return StateField.define<RangeSet<Decoration>>({
    create(state) {
      const decorations = buildInsertCellDecorations(
        mappingsRef.current,
        context,
        state.doc,
      );
      return RangeSet.of(decorations, true);
    },

    update(rangeSet, tr) {
      // Recompute on every update to ensure decorations match current mappings
      // This is simpler than caching since insert cells don't have expensive re-renders
      if (tr.docChanged || mappingsRef.current) {
        const decorations = buildInsertCellDecorations(
          mappingsRef.current,
          context,
          tr.state.doc,
        );
        return RangeSet.of(decorations, true);
      }
      return rangeSet;
    },

    provide: (f) => EditorView.decorations.from(f),
  });
}
