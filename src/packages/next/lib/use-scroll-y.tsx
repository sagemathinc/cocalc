/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { throttle } from "lodash";
import { useCallback, useEffect, useState } from "react";

// dynamically get the Y position of the window scroll
export function useScrollY() {
  const [scrollY, setScrollY] = useState(0);

  // callback is important, since we want to reain the same reference
  const onScroll = useCallback(
    throttle(
      (_event) => {
        setScrollY(window.pageYOffset);
      },
      100,
      { trailing: true }
    ),
    []
  );

  useEffect(() => {
    // passive: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#improving_scrolling_performance_with_passive_listeners
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return scrollY;
}
