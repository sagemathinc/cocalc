import { useRef } from "react";

import useDebounceEffect from "./use-debounce-effect";

export function useBottomScroller<T extends HTMLElement>(
  scroll = false,
  content: any,
) {
  const paragraphRef = useRef<T>(null);

  useDebounceEffect(
    {
      func: () => {
        if (!scroll) return;
        const p = paragraphRef.current;
        if (p == null) return;
        p.scrollTop = p.scrollHeight;
      },
      wait: 500,
      options: { leading: true, trailing: true },
    },
    [content],
  );

  return paragraphRef;
}
