/*
A hook to preserve and report scroll state for windowed virtuoso scrolling lists.

Uses an LRU cache in memory.

This uses the index of the top rendered item along with its offset from the
top of the list, so restoring the scroll position doesn't involve any async
nonsense at all!  It's much more robust than other approaches.

(This isn't long but took a lot of work to write, with many rewrites!)
*/
import LRU from "lru-cache";
import { useCallback, useMemo, useRef } from "react";

export interface ScrollState {
  index: number;
  offset: number;
}

const cache = new LRU<string, ScrollState>({ max: 500 });

export default function useVirtuosoScrollHook({
  cacheId,
  onScroll,
  initialState,
  disabled,
  scrollerRef: scrollerRef0,
}: {
  cacheId?: string;
  onScroll?: (state: ScrollState) => void;
  initialState?: ScrollState;
  disabled?: boolean; // if true, assume not going to be used.
  scrollerRef?;
}) {
  const itemRef = useRef<{ index: number; offset: number }>({
    index: 0,
    offset: 0,
  });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const handleScrollerRef = useCallback((ref) => {
    scrollerRef.current = ref;
    scrollerRef0?.(ref);
  }, []);
  if (disabled) return {};
  const lastScrollRef = useRef<ScrollState>(
    initialState ?? { index: 0, offset: 0 }
  );
  const recordScrollState = useMemo(() => {
    return (state: ScrollState) => {
      if (
        lastScrollRef.current.index != state.index ||
        lastScrollRef.current.offset != state.offset
      ) {
        if (cacheId) {
          cache.set(cacheId, state);
        }
        lastScrollRef.current = state;
        onScroll?.(state);
      }
    };
  }, [onScroll, cacheId]);

  return {
    initialTopMostItemIndex:
      (cacheId ? cache.get(cacheId) ?? initialState : initialState) ?? 0,
    scrollerRef: handleScrollerRef,
    onScroll: () => {
      const scrollTop = scrollerRef.current?.scrollTop;
      if (scrollTop == null) return;
      const state = {
        offset: scrollTop - itemRef.current.offset,
        index: itemRef.current.index,
      };
      recordScrollState(state);
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
      recordScrollState(state);
    },
  };
}
