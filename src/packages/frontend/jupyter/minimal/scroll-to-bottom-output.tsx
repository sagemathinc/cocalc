/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React, { useEffect, useRef } from "react";

/** Wrapper that caps output height and auto-scrolls to bottom on changes */
export function ScrollToBottomOutput({
  children,
  frameHeight,
}: {
  children: React.ReactNode;
  frameHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    // Defer initial scroll until after browser layout is complete
    const raf = requestAnimationFrame(scrollToBottom);
    // Re-scroll on any child DOM mutation (new output lines)
    const observer = new MutationObserver(() => {
      requestAnimationFrame(scrollToBottom);
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        maxHeight: frameHeight ? `${Math.round(frameHeight * 0.7)}px` : "70vh",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {children}
    </div>
  );
}
