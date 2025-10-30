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

import { WidgetType } from "@codemirror/view";
import { createRoot, Root } from "react-dom/client";

import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { MarkdownInput } from "@cocalc/frontend/editors/markdown-input";

/**
 * Widget that renders a markdown cell in display mode.
 * Shows formatted markdown with checkboxes and math support.
 * Double-click to enter edit mode.
 */
export class MarkdownDisplayWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private cellId: string,
    private source: string,
    private onDoubleClick: () => void,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "jupyter-markdown-display-widget";
    container.setAttribute("data-cell-id", this.cellId);
    container.style.cursor = "pointer";
    container.ondblclick = () => this.onDoubleClick();

    // Render using MostlyStaticMarkdown
    this.root = createRoot(container);
    this.root.render(
      <MostlyStaticMarkdown value={this.source} onChange={undefined} />,
    );

    return container;
  }

  destroy(): void {
    // Clean up React root when the widget is destroyed
    queueMicrotask(() => {
      if (this.root) {
        try {
          this.root.unmount();
        } catch (e) {
          console.warn("[MarkdownDisplayWidget] Error during unmount:", e);
        }
        this.root = null;
      }
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
 *
 * Note: Mentions popup may not display correctly inside CodeMirror widgets
 * due to z-index and overflow issues with the widget container.
 * See: https://github.com/codemirror/CodeMirror/issues/...
 */
export class MarkdownEditWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private cellId: string,
    private source: string,
    private onSave: (content: string) => void,
    private fontSize: number = 14,
    private projectId?: string,
    private path?: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "jupyter-markdown-edit-widget";
    container.setAttribute("data-cell-id", this.cellId);
    container.style.minHeight = "200px";
    // Ensure overflow is not hidden so mention popups can be visible
    container.style.overflow = "visible";

    // Render using MarkdownInput
    this.root = createRoot(container);
    this.root.render(
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

    return container;
  }

  destroy(): void {
    // Clean up React root when the widget is destroyed
    queueMicrotask(() => {
      if (this.root) {
        try {
          this.root.unmount();
        } catch (e) {
          console.warn("[MarkdownEditWidget] Error during unmount:", e);
        }
        this.root = null;
      }
    });
  }

  ignoreEvent(): boolean {
    return false; // Allow keyboard events (needed for Shift+Enter)
  }
}

/**
 * Widget that renders a raw cell.
 * Shows plaintext (no special rendering).
 */
export class RawDisplayWidget extends WidgetType {
  constructor(
    private cellId: string,
    private source: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "jupyter-raw-widget";
    container.setAttribute("data-cell-id", this.cellId);
    container.style.fontFamily = "monospace";
    container.style.whiteSpace = "pre-wrap";
    container.style.wordWrap = "break-word";
    container.style.padding = "8px";
    container.style.backgroundColor = "#f5f5f5";
    container.textContent = this.source;

    return container;
  }

  ignoreEvent(): boolean {
    return true; // Read-only, don't bubble events
  }
}
