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
    console.log("cm-adapter: changeHandler", (cm as any)._applying_remote);
    if ((cm as any)._applying_remote) return;
    onChangeDebounced?.();
    if (changeObj?.origin != null && changeObj.origin !== "setValue") {
      onExitUndo?.();
    }
  };

  cm.on("change", changeHandler);

  return () => {
    console.log("cm-adapter: dispose");
    cm.off("change", changeHandler);
  };
}
