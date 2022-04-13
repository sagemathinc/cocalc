/*
A hook to preserve and report scroll state for windowed virtuoso scrolling lists.

Uses an LRU cache in memory.

This uses the index of the top rendered item along with its offset from the
top of the list, so restoring the scroll position doesn't involve any async
nonsense at all!  It's much more robust than other approaches.

(This isn't long but took a lot of work to write, with many rewrites!)
*/
import LRU from "lru-cache";
import { useCallback, useRef } from "react";

export interface ScrollState {
  index: number;
  offset: number;
}

const cache = new LRU<string, ScrollState>({ max: 500 });

export default function useVirtuosoScrollHook({
  cacheId,
  onScroll,
  initialState,
}: {
  cacheId?: string;
  onScroll?: (state: ScrollState) => void;
  initialState?: ScrollState;
}) {
  const itemRef = useRef<{ index: number; offset: number }>({
    index: 0,
    offset: 0,
  });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const handleScrollerRef = useCallback((ref) => {
    scrollerRef.current = ref;
  }, []);

  return {
    initialTopMostItemIndex: (cacheId ? cache.get(cacheId) : initialState) ?? 0,
    scrollerRef: handleScrollerRef,
    onScroll: () => {
      const scrollTop = scrollerRef.current?.scrollTop;
      if (scrollTop == null) return;
      const state = {
        offset: scrollTop - itemRef.current.offset,
        index: itemRef.current.index,
      };
      if (cacheId) {
        cache.set(cacheId, state);
      }
      onScroll?.(state);
    },
    itemsRendered: (items) => {
      if (items.length == 0) return;
      const scrollTop = scrollerRef.current?.scrollTop;
      if (scrollTop == null) return;
      itemRef.current = items[0];
      const state = {
        offset: scrollTop - items[0].offset,
        index: items[0].index,
      };
      if (cacheId) {
        cache.set(cacheId, state);
      }
      onScroll?.(state);
    },
  };
}
