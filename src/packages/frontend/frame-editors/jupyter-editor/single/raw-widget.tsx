/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Raw cell widget for single-file view.

Renders plaintext content (no special rendering or editing).
Includes insert-cell widget below for consistency with other cell types.
*/

import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";
import { createRoot, Root } from "react-dom/client";

import { InsertCell } from "@cocalc/frontend/jupyter/insert-cell";
import type { MarkdownWidgetContext } from "./markdown-widgets";

/**
 * Widget that renders a raw cell.
 * Shows plaintext (no special rendering).
 * Includes insert-cell widget below for consistency with other cell types.
 */
export class RawDisplayWidget extends WidgetType {
  private roots: Root[] = [];

  constructor(
    private cellId: string,
    private source: string,
    private view?: EditorView,
    private context?: MarkdownWidgetContext,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.width = "100%";

    // Raw content container
    const container = document.createElement("div");
    container.className = "jupyter-raw-widget";
    container.setAttribute("data-cell-id", this.cellId);
    container.style.fontFamily = "monospace";
    container.style.whiteSpace = "pre-wrap";
    container.style.wordWrap = "break-word";
    container.style.padding = "8px";
    container.style.backgroundColor = "#f5f5f5";
    container.textContent = this.source;

    wrapper.appendChild(container);

    // Include insert-cell widget below raw, just like OutputWidget
    if (this.context?.actions) {
      const insertCellDiv = document.createElement("div");
      insertCellDiv.className = "jupyter-insert-cell-widget";
      insertCellDiv.style.width = "100%";
      insertCellDiv.style.height = "14px";
      insertCellDiv.style.flex = "0 0 auto";

      const insertCellRoot = createRoot(insertCellDiv);
      insertCellRoot.render(
        <InsertCell
          id={this.cellId}
          position="below"
          actions={this.context.actions}
          project_id={this.context.project_id}
          llmTools={undefined}
          mode="single"
          onInsertCell={this.context.onInsertCell}
          showAICellGen={null}
          setShowAICellGen={() => {}}
          alwaysShow={false}
        />,
      );
      this.roots.push(insertCellRoot);
      wrapper.appendChild(insertCellDiv);
    }

    // Request measure (for consistency, though raw widgets are simpler)
    if (this.view) {
      queueMicrotask(() => {
        if (this.view) {
          this.view.requestMeasure();
        }
      });
    }

    return wrapper;
  }

  destroy(): void {
    // Clean up React roots when the widget is destroyed
    queueMicrotask(() => {
      for (const root of this.roots) {
        try {
          root.unmount();
        } catch (e) {
          console.warn("[RawDisplayWidget] Error during unmount:", e);
        }
      }
      this.roots = [];
    });
  }

  ignoreEvent(): boolean {
    return true; // Read-only, don't bubble events
  }
}
