import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function useViewsToggle(table: string) {
  const { actions, id, desc } = useFrameContext();
  const showViews = desc.get(`show-views-${table}`) ?? true;
  const setShowViews = (showViews: boolean) => {
    actions.set_frame_tree({ id, [`show-views-${table}`]: showViews });
  };
  return { showViews, setShowViews };
}
