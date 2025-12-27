/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Text Editor Actions

Extends BaseEditorActions with SyncString-specific behavior (string docs).
This is the only place that should use to_str() and the SyncAdapter/
MergeCoordinator wiring that assumes string documents.
*/

import type { CodeEditorState } from "./actions-base";
import { BaseEditorActions } from "./actions-base";
import { SyncAdapter } from "../code-editor/sync-adapter";

export class TextEditorActions<
  T extends CodeEditorState = CodeEditorState,
> extends BaseEditorActions<T> {
  protected _init_syncstring_value(): void {
    const latest = this.getLatestVersion();
    try {
      const value = this._syncstring.to_str();
      this.getMergeCoordinator().seedBase(value, latest as any);
    } catch {
      // ignore if not ready yet
    }
    if (this.doctype == "syncstring") {
      this.syncAdapter?.dispose();
      this.syncAdapter = new SyncAdapter({
        sync: this._syncstring,
        onRemoteChange: () => {
          if (!this._syncstring) return;
          this.handleRemoteSyncstringChange(this._syncstring.to_str());
        },
      });
    }
  }

  protected afterSyncReady(): void {
    try {
      this.getMergeCoordinator().seedBase(
        this._syncstring.to_str(),
        this.getLatestVersion(),
      );
    } catch {
      // ignore if not available yet
    }
  }
}

export { TextEditorActions as Actions };
export type { CodeEditorState };
