/*
Helpers for wiring CodeMirror to sync-aware actions.
Provides a single place to attach change/dirty listeners with guards to
ignore programmatic remote applications.
*/

import type * as CodeMirror from "codemirror";

interface SyncListenerOptions {
  onDirty?: () => void;
  onChangeDebounced?: () => void;
  onExitUndo?: () => void;
}

export function attachSyncListeners(
  cm: CodeMirror.Editor,
  { onDirty, onChangeDebounced, onExitUndo }: SyncListenerOptions,
): () => void {
  const changeHandler = (_: any, changeObj: any) => {
    if ((cm as any)._applying_remote) return;
    onChangeDebounced?.();
    if (changeObj?.origin != null && changeObj.origin !== "setValue") {
      onDirty?.();
      onExitUndo?.();
    }
  };

  const beforeChangeHandler = (_: any, changeObj: any) => {
    if ((cm as any)._applying_remote) return;
    if (changeObj?.origin !== "setValue") {
      onDirty?.();
    }
  };

  const keydownHandler = () => {
    onDirty?.();
  };

  cm.on("change", changeHandler);
  cm.on("beforeChange", beforeChangeHandler);
  cm.on("keydown", keydownHandler);

  return () => {
    cm.off("change", changeHandler);
    cm.off("beforeChange", beforeChangeHandler);
    cm.off("keydown", keydownHandler);
  };
}
