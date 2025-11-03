/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Markdown cell widgets for single-file view.

Supports two modes:
- Display mode: MostlyStaticMarkdown (rendered markdown with checkboxes)
- Edit mode: MarkdownInput (WYSIWYG + plaintext editor)
*/

import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";
import { createRoot, Root } from "react-dom/client";

import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { MarkdownInput } from "@cocalc/frontend/editors/markdown-input";
import { InsertCell } from "@cocalc/frontend/jupyter/insert-cell";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";

export interface MarkdownWidgetContext {
  actions?: JupyterActions;
  project_id?: string;
  onInsertCell?: (
    cellId: string,
    type: "code" | "markdown",
    position: "above" | "below",
  ) => void;
}

/**
 * Widget that renders a markdown cell in display mode.
 * Shows formatted markdown with checkboxes and math support.
 * Double-click to enter edit mode.
 * Includes insert-cell widget below for consistency with OutputWidget.
 */
export class MarkdownDisplayWidget extends WidgetType {
  private roots: Root[] = [];

  constructor(
    private cellId: string,
    private source: string,
    private onDoubleClick: () => void,
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

    // Markdown content container
    const container = document.createElement("div");
    container.className = "jupyter-markdown-display-widget";
    container.setAttribute("data-cell-id", this.cellId);
    container.style.cursor = "pointer";
    container.ondblclick = () => this.onDoubleClick();

    // Render using MostlyStaticMarkdown
    const root = createRoot(container);
    root.render(
      <MostlyStaticMarkdown value={this.source} onChange={undefined} />,
    );
    this.roots.push(root);

    wrapper.appendChild(container);

    // Include insert-cell widget below markdown, just like OutputWidget
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

    // Request measure after React has rendered the markdown content
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
          console.warn("[MarkdownDisplayWidget] Error during unmount:", e);
        }
      }
      this.roots = [];
    });
  }

  ignoreEvent(): boolean {
    return false; // Allow double-click event to propagate
  }
}

/**
 * Widget that renders a markdown cell in edit mode.
 * Shows MarkdownInput with WYSIWYG and plaintext editing.
 * Shift+Enter to save, Return for newline.
 * Includes insert-cell widget below for consistency with OutputWidget.
 *
 * Note: Mentions popup may not display correctly inside CodeMirror widgets
 * due to z-index and overflow issues with the widget container.
 * See: https://github.com/codemirror/CodeMirror/issues/...
 */
export class MarkdownEditWidget extends WidgetType {
  private roots: Root[] = [];

  constructor(
    private cellId: string,
    private source: string,
    private onSave: (content: string) => void,
    private fontSize: number = 14,
    private projectId?: string,
    private path?: string,
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

    // Markdown edit container
    const container = document.createElement("div");
    container.className = "jupyter-markdown-edit-widget";
    container.setAttribute("data-cell-id", this.cellId);
    container.style.minHeight = "200px";
    // Ensure overflow is not hidden so mention popups can be visible
    container.style.overflow = "visible";

    // Render using MarkdownInput
    const root = createRoot(container);
    root.render(
      <MarkdownInput
        value={this.source}
        onChange={(_value) => {
          // Note: We don't auto-save on every change.
          // Changes are only saved on Shift+Enter.
        }}
        onShiftEnter={(value) => {
          // Save on Shift+Enter and exit edit mode
          this.onSave(value);
        }}
        height="auto"
        fontSize={this.fontSize}
        enableMentions={this.projectId != null && this.path != null}
        project_id={this.projectId}
        path={this.path}
      />,
    );
    this.roots.push(root);

    wrapper.appendChild(container);

    // Include insert-cell widget below markdown, just like OutputWidget
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

    // Request measure after React has rendered the markdown editor
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
          console.warn("[MarkdownEditWidget] Error during unmount:", e);
        }
      }
      this.roots = [];
    });
  }

  ignoreEvent(): boolean {
    return false; // Allow keyboard events (needed for Shift+Enter)
  }
}

/**
 * Widget that renders a raw cell.
 * Shows plaintext (no special rendering).
 * Includes insert-cell widget below for consistency with OutputWidget.
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
