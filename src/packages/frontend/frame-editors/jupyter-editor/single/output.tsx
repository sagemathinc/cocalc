/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Output widget for rendering notebook cell outputs.
Reuses CellOutputMessage from the existing output rendering system.
*/

import { WidgetType } from "@codemirror/view";
import { fromJS, Map } from "immutable";
import { createRoot, Root } from "react-dom/client";

import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { CellOutputMessage } from "@cocalc/frontend/jupyter/output-messages/message";

export interface OutputWidgetContext {
  actions?: JupyterActions;
  name?: string;
  project_id?: string;
  directory?: string;
  cellId?: string;
  trust?: boolean;
}

/**
 * Widget that renders notebook cell outputs.
 * Replaces the invisible ZWS marker line in the editor.
 *
 * Reuses CellOutputMessage from packages/frontend/jupyter/output-messages/message.tsx
 * to leverage existing MIME type detection, priority system, and rendering logic.
 */
export class OutputWidget extends WidgetType {
  private roots: Root[] = [];

  constructor(
    private cellId: string,
    private outputs: any[],
    private cellType: string,
    private context: OutputWidgetContext = {},
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "jupyter-output-widget";
    container.setAttribute("data-cell-id", this.cellId);

    // Only render outputs for code cells
    if (this.cellType !== "code" || !this.outputs?.length) {
      return container;
    }

    // Render each output using CellOutputMessage
    for (let index = 0; index < this.outputs.length; index++) {
      const output = this.outputs[index];
      const outputDiv = document.createElement("div");
      outputDiv.className = "jupyter-output-item";
      container.appendChild(outputDiv);

      // Convert plain object to Immutable Map (CellOutputMessage expects this)
      const messageMap: Map<string, any> = fromJS(output);

      // Render the output using the existing CellOutputMessage component
      const root = createRoot(outputDiv);
      root.render(
        <CellOutputMessage
          message={messageMap}
          project_id={this.context.project_id}
          directory={this.context.directory}
          actions={this.context.actions}
          name={this.context.name}
          id={this.cellId}
          index={index}
          trust={this.context.trust ?? true}
        />,
      );
      this.roots.push(root);

      // Add error handler to all img tags to detect broken images
      // If an image fails to load, log it so we can investigate timing issues
      const imgElements = Array.from(outputDiv.querySelectorAll("img"));
      for (const img of imgElements) {
        img.addEventListener("error", () => {
          console.warn(
            `[Jupyter Output] Image failed to load: ${img.src.substring(0, 50)}...`,
          );
        });
        img.addEventListener("load", () => {
          // Reset any error indicators once image loads successfully
          img.style.opacity = "1";
        });
      }
    }

    return container;
  }

  destroy(): void {
    // Clean up React roots when the widget is destroyed
    // Use microtask to defer unmount and avoid synchronous unmount during render
    queueMicrotask(() => {
      for (const root of this.roots) {
        try {
          root.unmount();
        } catch (e) {
          // Ignore errors during unmount
          console.warn("[OutputWidget] Error during unmount:", e);
        }
      }
      this.roots = [];
    });
  }

  ignoreEvent(): boolean {
    return true; // Read-only, don't bubble events
  }
}
