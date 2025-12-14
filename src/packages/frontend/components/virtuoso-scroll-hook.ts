/*
A hook to preserve and restore scroll state for Virtuoso lists.

- Uses an in-memory LRU cache keyed by `cacheId`.
- Avoids caching the initial "top" state when an initial target is provided.
  Without this guard, the very first itemsRendered callback can overwrite the
  intended initial position (e.g., newest item) with index 0.
*/

import LRUCache from "lru-cache";
import { useCallback, useMemo, useRef } from "react";

type ScrollState = { index: number; offset: number };

const DEFAULT_VIEWPORT = 1000;
const cache = new LRUCache<string, ScrollState>({ max: 500 });

export default function useVirtuosoScrollHook({
  cacheId,
  onScroll,
  initialState,
  disabled,
  scrollerRef: scrollerRefProp,
}: {
  cacheId?: string;
  onScroll?: (state: ScrollState) => void;
  initialState?: ScrollState;
  disabled?: boolean;
  scrollerRef?: (ref: any) => void;
}) {
  const itemRef = useRef<ScrollState>({
    index: 0,
    offset: 0,
  });
  const scrollerRef = useRef<any>(null);

  const cached = cacheId ? cache.get(cacheId) : undefined;
  const target = cached ?? initialState ?? { index: 0, offset: 0 };

  const handleScrollerRef = useCallback(
    (ref: any) => {
      scrollerRef.current = ref;
      scrollerRefProp?.(ref);
    },
    [scrollerRefProp],
  );

  const lastScrollRef = useRef<ScrollState>(target);
  // Avoid caching the very first "top" state when we intend to start elsewhere.
  const recordingReadyRef = useRef<boolean>(
    cached != null || target.index === 0,
  );

  const recordScrollState = useMemo(() => {
    return (state: ScrollState) => {
      // console.log("recordScrollState", cacheId, state);
      if (!recordingReadyRef.current) {
        if (state.index >= target.index) {
          recordingReadyRef.current = true;
        } else {
          return;
        }
      }
      if (
        lastScrollRef.current.index !== state.index ||
        lastScrollRef.current.offset !== state.offset
      ) {
        if (cacheId) {
          cache.set(cacheId, state);
        }
        lastScrollRef.current = state;
        onScroll?.(state);
      }
    };
  }, [onScroll, cacheId, target.index]);

  if (disabled) return {};

  //console.log("useVirtuosoScrollHook", cacheId, target);

  return {
    increaseViewportBy: DEFAULT_VIEWPORT,
    initialTopMostItemIndex: target.index,
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
    itemsRendered: (items: ScrollState[]) => {
      if (items.length === 0) return;
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
