/*
Similar to WindowedList, except with the default option to not be windowing,
and a more modern implementation.

This DOES store the scrollTop position in memory when you move around, so when
the component gets unmounted and remounted, the scroll position is preserved.
The scroll position is not preserved in localStorage though. The scroll
positioned are in an LRU cache, so use a bounded amount of memory.

CAVEAT: most of the other options and methods from WindowedList are not
implemented here.
*/

import { ReactNode, useEffect, useRef } from "react";
import { Props as WindowedProps, WindowedList } from "./windowed-list";
import LRU from "lru-cache";
import { useDebouncedCallback } from "use-debounce";

const cache = new LRU<string, number>({ max: 250 });

interface Props {
  rowCount: number;
  rowRenderer: (_: { key: string; index: number }) => ReactNode;
  rowKey: (index: number) => string;
  // used to cache scroll position between unmounting and remounting
  cacheId?: string;
  // if given, uses windowing right now via WindowedList; pass all additional props as for WindowedList.
  windowing?: Partial<WindowedProps>;
}

export default function ScrollableList({
  rowCount,
  rowRenderer,
  rowKey,
  cacheId,
  windowing,
}: Props) {
  const divRef = useRef<any>(null);
  useEffect(() => {
    if (windowing != null || !cacheId) return;
    const elt = divRef.current;
    if (elt == null) return;
    const scrollTop = cache.get(cacheId);
    if (scrollTop == null) return;
    // restore scroll position
    elt.scrollTop = scrollTop;
  }, []);

  if (windowing != null) {
    windowing.row_count = rowCount;
    windowing.row_renderer = rowRenderer;
    windowing.row_key = rowKey;
    windowing.cache_id = cacheId;
    return <WindowedList {...(windowing as WindowedProps)} />;
  }

  const saveScrollPos = useDebouncedCallback((event: any) => {
    if (cacheId == null) return;
    const scrollTop = event.target.scrollTop;
    if (scrollTop != null) {
      cache.set(cacheId, scrollTop);
    }
  }, 75);

  const v: ReactNode[] = [];
  for (let index = 0; index < rowCount; index++) {
    v.push(rowRenderer({ key: rowKey(index), index }));
  }
  return (
    <div
      ref={divRef}
      style={{ overflowY: "scroll", height: "100%" }}
      onScroll={cacheId != null ? saveScrollPos : undefined}
    >
      {v}
    </div>
  );
}
