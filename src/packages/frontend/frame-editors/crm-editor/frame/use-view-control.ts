import { useCallback, useMemo } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function useViewControl(
  table: string,
  defaultViewId?: string
): {
  view: string | undefined;
  switchToView: (viewId: string) => void;
} {
  const { actions, id: frameId, desc } = useFrameContext();

  const viewKey = useMemo(() => `data-view-${table}`, [table]);

  const view = useMemo<string | undefined>(() => {
    return desc.get(viewKey, defaultViewId);
  }, [desc]);

  const switchToView = useCallback(
    (viewId: string) => {
      actions.set_frame_tree({ id: frameId, [viewKey]: viewId });
    },
    [table]
  );

  return { view, switchToView };
}
