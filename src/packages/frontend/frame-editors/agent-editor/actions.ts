/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Actions for the .ai agent editor.

The .ai file uses a SyncDB to store agent conversation sessions.
Each record has: session_id, date, sender, content, event, account_id.
*/

import type { FrameTree } from "../frame-tree/types";
import {
  Actions as CodeEditorActions,
  CodeEditorState,
} from "../code-editor/actions";

export class Actions extends CodeEditorActions<CodeEditorState> {
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
      first: { type: "ai-agent" },
      second: { type: "ai-app-preview" },
      pos: 0.4,
    };
  }

  // Triggers an app preview refresh. Uses the existing resize counter
  // as a general-purpose change signal that components can watch.
  reloadAppPreview(): void {
    this.setState({ resize: (this.store.get("resize") ?? 0) + 1 });
  }
}
