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

export type ServerVerb = "start" | "stop" | "restart";

export interface AppError {
  type: string; // "error" | "console.error" | "unhandledrejection"
  message: string;
  source?: string;
  line?: number;
  col?: number;
  timestamp: number;
}

export type AppMode = "app" | "server";

interface AgentEditorState extends CodeEditorState {
  app_errors?: AppError[];
  app_reload?: number;
  app_mode?: AppMode;
  server_port?: number;
}

// Sentinel keys for the server state record in the syncdb
const SERVER_STATE_SESSION_ID = "__server_state__";
const SERVER_STATE_DATE = "__server_state__";

export class Actions extends CodeEditorActions<AgentEditorState> {
  protected doctype: string = "syncdb";
  protected primary_keys = ["session_id", "date"];
  protected string_cols = ["content"];

  _init2(): void {
    // Restore persisted server state from syncdb once it's ready.
    // Note: for doctype="syncdb", the base class assigns to _syncstring, not _syncdb.
    const syncdb = this._syncstring as any;
    if (!syncdb) return;
    const restore = () => {
      const record = syncdb.get_one({
        session_id: SERVER_STATE_SESSION_ID,
        date: SERVER_STATE_DATE,
      });
      if (record) {
        const mode = record.get("content") as string;
        const port = record.get("server_port") as number;
        if (mode === "server" && port > 0) {
          this.setState({ app_mode: "server", server_port: port } as any);
        }
      }
    };
    if (syncdb.get_state() === "ready") {
      restore();
    } else {
      syncdb.once("ready", restore);
    }
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

  // Triggers an app preview refresh via a dedicated counter, separate
  // from the editor's resize counter (which fires on splitter drags,
  // window resizes, and tab switches — none of which should reload the app).
  reloadAppPreview(): void {
    this.setState({
      app_reload: ((this.store.get("app_reload") as number) ?? 0) + 1,
    } as any);
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

  // Switch to server mode — show the given port in the app preview iframe.
  // Persisted to syncdb so other clients and page reloads see the same state.
  setServerMode(port: number): void {
    this.setState({ app_mode: "server", server_port: port } as any);
    this._persistServerState("server", port);
  }

  // Switch back to static app mode
  stopServer(): void {
    this.setState({ app_mode: "app", server_port: 0 } as any);
    this._persistServerState("app", 0);
  }

  private _persistServerState(mode: AppMode, port: number): void {
    const syncdb = this._syncstring as any;
    if (!syncdb || syncdb.get_state() !== "ready") return;
    syncdb.set({
      session_id: SERVER_STATE_SESSION_ID,
      date: SERVER_STATE_DATE,
      event: "server_state",
      content: mode,
      server_port: port,
    });
    syncdb.commit();
  }

  // Reload the server iframe (bumps the reload counter while staying in server mode)
  restartServer(): void {
    this.setState({
      app_reload: ((this.store.get("app_reload") as number) ?? 0) + 1,
    } as any);
  }
}
