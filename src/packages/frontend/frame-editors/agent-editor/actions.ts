/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Actions for the .app agent editor.

The .app file uses a SyncDB to store agent conversation sessions.
Each record has: session_id, date, sender, content, event, account_id.
*/

import type { FrameTree } from "../frame-tree/types";
import {
  Actions as CodeEditorActions,
  CodeEditorState,
} from "../code-editor/actions";

export interface AppError {
  type: string; // "error" | "console.error" | "unhandledrejection"
  message: string;
  source?: string;
  line?: number;
  col?: number;
  timestamp: number;
}

interface AgentEditorState extends CodeEditorState {
  app_errors?: AppError[];
}

export class Actions extends CodeEditorActions<AgentEditorState> {
  protected doctype: string = "syncdb";
  protected primary_keys = ["session_id", "date"];
  protected string_cols = ["content"];

  _init2(): void {
    // nothing extra needed — the agent panel reads directly from the syncdb
  }

  _raw_default_frame_tree(): FrameTree {
    return {
      type: "node",
      direction: "col",
      first: { type: "agent" },
      second: { type: "app_preview" },
      pos: 0.4,
    };
  }

  // Triggers an app preview refresh. Uses the existing resize counter
  // as a general-purpose change signal that components can watch.
  reloadAppPreview(): void {
    this.setState({ resize: (this.store.get("resize") ?? 0) + 1 });
  }

  // Report errors from the iframe app preview
  reportAppErrors(errors: AppError[]): void {
    const existing = (this.store.get("app_errors") as any) ?? [];
    // Keep last 50 errors to avoid unbounded growth
    const merged = [...existing, ...errors].slice(-50);
    this.setState({ app_errors: merged } as any);
  }

  // Clear app errors (e.g., after agent acknowledges them)
  clearAppErrors(): void {
    this.setState({ app_errors: [] } as any);
  }
}
