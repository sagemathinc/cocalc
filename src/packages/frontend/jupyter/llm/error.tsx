/*
 *  This file is part of CoCalc: Copyright © 2020 - 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Use an LLM to explain an error message and help the user fix it.
When id and actions are available, provides Replace / Replace + Run buttons.
*/

import { CSSProperties, useCallback } from "react";

import type { JupyterActions } from "@cocalc/jupyter/redux/actions";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import HelpMeFix from "@cocalc/frontend/frame-editors/llm/help-me-fix";

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

  if (frameActions == null) return null;

  return (
    <HelpMeFix
      style={style}
      task="ran a cell in a Jupyter notebook"
      error={traceback}
      input={input}
      tag="jupyter-notebook-cell-eval"
      extraFileInfo={frameActions.languageModelExtraFileInfo()}
      language={frameActions.languageModelGetLanguage()}
      onReplace={hasReplaceSupport ? onReplace : undefined}
      cellId={id}
      notebookFrameActions={nbFrameActionsRef.current}
    />
  );
}
