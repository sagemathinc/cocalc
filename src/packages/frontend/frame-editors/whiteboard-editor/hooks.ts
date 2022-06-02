import { useEffect } from "react";
import {
  useFrameContext as useFrameContextGeneric,
  IFrameContext,
} from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";

// https://stackoverflow.com/questions/41285211/overriding-interface-property-type-defined-in-typescript-d-ts-file
type Modify<T, R> = Omit<T, keyof R> & R;

type WhiteboardFrameContext = Modify<
  IFrameContext,
  {
    actions: Actions;
  }
>;

export function useFrameContext(): WhiteboardFrameContext {
  return useFrameContextGeneric() as WhiteboardFrameContext;
}

// ensure current page and number of pages is set for this frame:
export function usePageInfo(pagesMap) {
  const { desc, actions, id } = useFrameContext();
  useEffect(() => {
    let page = desc.get("page") ?? 1;
    let pages = 1;
    pagesMap?.forEach((_, n) => {
      pages = Math.max(pages, n);
    });
    if (pages != desc.get("pages")) {
      actions.setPages(id, pages);
    }
    if (page != desc.get("page")) {
      actions.setPage(id, page);
    }
  }, [pagesMap]);
}
