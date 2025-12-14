import LRUCache from "lru-cache";
import { ForwardedRef, forwardRef, useImperativeHandle, useRef } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import type { StateSnapshot } from "react-virtuoso";

interface CoreProps extends React.ComponentProps<typeof Virtuoso> {
  cacheId: string;
  initialIndex?: number;
}

const cache = new LRUCache<string, StateSnapshot>({ max: 500 });
const SAVE_THROTTLE_MS = 50;
const DEFAULT_VIEWPORT = 1000;

function StatefulVirtuosoCore(
  { cacheId, initialTopMostItemIndex, initialScrollTop, ...rest }: CoreProps,
  ref: ForwardedRef<VirtuosoHandle>,
) {
  const virtRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<any>(null);
  const snapshotRef = useRef<StateSnapshot | undefined>(undefined);
  const savingRef = useRef<boolean>(false);

  const cached = cacheId ? cache.get(cacheId) : undefined;
  if (cached && snapshotRef.current == null) {
    snapshotRef.current = cached;
  } else if (!cached && snapshotRef.current == null) {
    snapshotRef.current = undefined;
  }

  const saveState = () => {
    if (savingRef.current || !virtRef.current) return;
    savingRef.current = true;
    setTimeout(() => {
      virtRef.current?.getState((snapshot) => {
        snapshotRef.current = snapshot;
        if (cacheId) {
          cache.set(cacheId, snapshot);
        }
        savingRef.current = false;
      });
    }, SAVE_THROTTLE_MS);
  };

  useImperativeHandle(ref, () => virtRef.current as VirtuosoHandle, []);

  // Respect user-provided refs/handlers.
  const {
    ref: restRef,
    scrollerRef: restScrollerRef,
    onScroll: userOnScroll,
    itemsRendered: userItemsRendered,
    ...restProps
  } = rest as React.ComponentProps<typeof Virtuoso>;

  const handleRef = (handle: VirtuosoHandle | null) => {
    virtRef.current = handle;
    if (typeof restRef === "function") {
      restRef(handle);
    } else if (restRef && typeof restRef === "object") {
      (restRef as React.RefObject<VirtuosoHandle | null>).current = handle;
    }
  };

  const handleScrollerRef = (ref: any) => {
    scrollerRef.current = ref;
    if (typeof restScrollerRef === "function") {
      restScrollerRef(ref);
    } else if (restScrollerRef && typeof restScrollerRef === "object") {
      (restScrollerRef as React.RefObject<any>).current = ref;
    }
  };

  return (
    <Virtuoso
      restoreStateFrom={snapshotRef.current}
      increaseViewportBy={DEFAULT_VIEWPORT}
      ref={handleRef}
      scrollerRef={handleScrollerRef}
      onScroll={(...args) => {
        saveState();
        userOnScroll?.(...args);
      }}
      itemsRendered={(items) => {
        if (items.length === 0) return;
        userItemsRendered?.(items as any);
      }}
      {...(snapshotRef.current == null && initialTopMostItemIndex != null
        ? { initialTopMostItemIndex }
        : {})}
      {...(snapshotRef.current == null && initialScrollTop != null
        ? { initialScrollTop }
        : {})}
      {...restProps}
    />
  );
}

const StatefulVirtuosoCoreWithRef = forwardRef<VirtuosoHandle, CoreProps>(
  StatefulVirtuosoCore,
);

// Public component that remounts the core when cacheId changes, so all refs
// and timers are fresh for a new identity.
function StatefulVirtuoso(props: CoreProps, ref: ForwardedRef<VirtuosoHandle>) {
  const { cacheId, ...rest } = props;
  if (!cacheId) {
    console.warn("StatefulVirtuoso requires a cacheId for state persistence.");
  }
  return (
    <StatefulVirtuosoCoreWithRef
      key={cacheId ?? "default"}
      cacheId={cacheId}
      {...rest}
      ref={ref}
    />
  );
}

export default forwardRef<VirtuosoHandle, CoreProps>(StatefulVirtuoso);
