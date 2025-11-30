/*
Helpers for wiring CodeMirror to sync-aware actions.
Provides a single place to attach change/dirty listeners with guards to
ignore programmatic remote applications.
*/

import type * as CodeMirror from "codemirror";

interface SyncListenerOptions {
  onChangeDebounced?: () => void;
  onExitUndo?: () => void;
}

export function attachSyncListeners(
  cm: CodeMirror.Editor,
  { onChangeDebounced, onExitUndo }: SyncListenerOptions,
): () => void {
  const changeHandler = (_: any, changeObj: any) => {
    if ((cm as any)._applying_remote) return;
    onChangeDebounced?.();
    if (changeObj?.origin != null && changeObj.origin !== "setValue") {
      onExitUndo?.();
    }
  };

  const beforeChangeHandler = (_: any, _changeObj: any) => {
    if ((cm as any)._applying_remote) return;
  };

  cm.on("change", changeHandler);
  cm.on("beforeChange", beforeChangeHandler);

  return () => {
    cm.off("change", changeHandler);
    cm.off("beforeChange", beforeChangeHandler);
  };
}
