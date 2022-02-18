import { NotebookFrameActions } from "./actions";
import { JupyterEditorActions } from "../actions";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { useRef } from "react";

export default function useNotebookFrameActions() {
  const frameContext = useFrameContext();
  const ref = useRef<NotebookFrameActions | undefined>(undefined);
  // In some cases, e.g., a Jupyter notebook + timetravel
  ref.current = (
    frameContext.actions as JupyterEditorActions
  ).get_frame_actions?.(frameContext.id);
  return ref;
}
