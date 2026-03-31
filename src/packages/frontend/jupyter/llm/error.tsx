/*
 *  This file is part of CoCalc: Copyright © 2020 - 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Use an LLM to explain an error message and help the user fix it.
When id and actions are available, provides Replace / Replace + Run buttons.
*/

import { CSSProperties, useCallback, useMemo } from "react";

import type { JupyterActions } from "@cocalc/jupyter/redux/actions";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import HelpMeFix from "@cocalc/frontend/frame-editors/llm/help-me-fix";
import { trunc } from "@cocalc/util/misc";

interface Props {
  style?: CSSProperties;
  input: string;
  traceback: string;
  id?: string;
  actions?: JupyterActions;
}

export default function LLMError({
  style,
  traceback,
  input,
  id,
  actions,
}: Props) {
  const { actions: frameActions } = useFrameContext();
  const nbFrameActionsRef = useNotebookFrameActions();

  const hasReplaceSupport = id != null && actions != null;

  const onReplace = useCallback(
    ({ code, run }: { code: string; run?: boolean }) => {
      if (id != null && actions != null) {
        actions.set_cell_input(id, code);
        if (run) {
          actions.run_cell(id);
        }
      }
    },
    [id, actions],
  );

  // Build context from neighboring cells so the agent understands
  // what functions/variables are defined nearby.
  const { neighborContext, cellNumber } = useMemo(() => {
    if (!id || !actions) return { neighborContext: undefined, cellNumber: undefined };
    const store = actions.store;
    if (!store) return { neighborContext: undefined, cellNumber: undefined };
    const cellList = store.get("cell_list");
    if (!cellList) return { neighborContext: undefined, cellNumber: undefined };
    const ids = cellList.toJS() as string[];
    const idx = ids.indexOf(id);
    if (idx < 0) return { neighborContext: undefined, cellNumber: undefined };

    const MAX_NEIGHBOR_CHARS = 1200;
    const parts: string[] = [];
    // Show up to 3 cells above for context
    const start = Math.max(0, idx - 3);
    for (let i = start; i < idx; i++) {
      const cellId = ids[i];
      const cell = store.getIn(["cells", cellId]) as any;
      if (!cell) continue;
      const cellInput = (cell.get("input") ?? "") as string;
      if (!cellInput.trim()) continue;
      const cellType = (cell.get("cell_type") ?? "code") as string;
      parts.push(
        `Cell #${i + 1} (${cellType}):\n\`\`\`\n${trunc(cellInput, MAX_NEIGHBOR_CHARS)}\n\`\`\``,
      );
    }
    return {
      neighborContext: parts.length > 0
        ? `Cells above the failing cell:\n\n${parts.join("\n\n")}`
        : undefined,
      cellNumber: idx + 1,
    };
  }, [id, actions]);

  if (frameActions == null) return null;

  return (
    <HelpMeFix
      style={style}
      task="ran a cell in a Jupyter notebook"
      error={traceback}
      input={input}
      tag="jupyter-notebook-cell-eval"
      extraFileInfo={
        cellNumber != null
          ? `Cell #${cellNumber} in my ${frameActions.languageModelExtraFileInfo()}`
          : frameActions.languageModelExtraFileInfo()
      }
      language={frameActions.languageModelGetLanguage()}
      extraContext={neighborContext}
      onReplace={hasReplaceSupport ? onReplace : undefined}
      cellId={id}
      notebookFrameActions={nbFrameActionsRef.current}
    />
  );
}
