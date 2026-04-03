/*
Pinch to zoom support

Usage:  put

usePinchToZoom({target:ref to thing to scroll, min, max})

This usePinch makes it so 2-finger pinch zoom gestures just modify the font
size for the visible canvas, instead of zooming the whole page itself.

*/

import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { useFrameContext } from "./frame-context";
import { usePinch } from "@use-gesture/react";
import { throttle } from "lodash";

export const ZOOM100 = 14;
export function fontSizeToZoom(size?: number): number {
  return size ? size / ZOOM100 : 1;
}

/*
I'm just setting these globally for the application.  It seems to
never be a good idea, and this keeps behavior not subtly changed
depending on what editors are open!

NOTE: These events are only handled by Safari on desktop.  They
are ignored by desktop chrome, where there is no way to disable
these gestures, except for disabling the wheel event on parts
of the page... which has its own problems.  See discussion here:
https://github.com/pixijs/pixijs/issues/6414 and
https://developer.mozilla.org/en-US/docs/Web/API/Element/gesturestart_event
where these events are clearly Safari only.
*/
const handler = (e) => {
  e.preventDefault();
};
document.addEventListener("gesturestart", handler);
document.addEventListener("gesturechange", handler);
document.addEventListener("gestureend", handler);

export interface Data {
  fontSize: number;
  first?: boolean;
}

const pinchMax = 100;

export default function usePinchToZoom({
  target,
  min = 5,
  max = 100,
  onZoom,
  throttleMs = 50,
  smooth: _smooth = 5,
  disabled,
  getFontSize,
  wheelSpeed = 1,
}: {
  target: MutableRefObject<any>; // reference to element that we want pinch zoom.
  min?: number;
  max?: number;
  onZoom?: (data: Data) => void; // if given, then font size is NOT set via actions.
  throttleMs?: number;
  smooth?: number;
  disabled?: boolean;
  getFontSize?: () => number; // function that gets current font size for application; useful so that zoom starts at out right value, in case changed externally
  wheelSpeed?: number; // multiplier for ctrl+wheel zoom speed (default 1)
}) {
  const { actions, id } = useFrameContext();

  const saveThrottled = useMemo(() => {
    if (disabled) return () => {};
    return throttle((fontSize, first) => {
      if (onZoom != null) {
        onZoom({ fontSize, first });
        return;
      }
      actions.set_font_size(id, fontSize);
    }, throttleMs);
  }, [id]);

  const save = useMemo(() => {
    if (disabled) return () => {};
    return (fontSize, first) => {
      saveThrottled(fontSize, first);
    };
  }, [id]);

  const lastOffsetRef = useRef<number>(100);

  const isZoomingRef = useRef<boolean>(false);

  // Keep refs for values that change on re-render so gesture
  // callbacks always see the latest without stale closures.
  const getFontSizeRef = useRef(getFontSize);
  getFontSizeRef.current = getFontSize;
  const saveRef = useRef(save);
  saveRef.current = save;

  // Ctrl+wheel zoom: native listener with stopImmediatePropagation to
  // prevent @use-gesture's usePinch from also handling these events
  // (Chrome translates ctrl+wheel into pinch gesture events).
  // Uses multiplicative (log) scaling for even zoom feel.
  const wheelFontSizeRef = useRef<number>(0);
  useEffect(() => {
    if (disabled) return;
    const el = target.current;
    if (el == null) return;

    let zoomEndTimer: ReturnType<typeof setTimeout> | undefined;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Stop this event from reaching @use-gesture's pinch handler.
      e.stopImmediatePropagation();

      if (!isZoomingRef.current) {
        wheelFontSizeRef.current =
          getFontSizeRef.current?.() ?? (max + min) / 2;
      }
      // Multiplicative scaling: each tick changes zoom by a percentage.
      // Cap the exponent to prevent fast-scroll jumps.
      const MAX_STEP = 0.16 * wheelSpeed;
      const rawExp = (-e.deltaY / 750) * wheelSpeed;
      const clampedExp = Math.max(-MAX_STEP, Math.min(MAX_STEP, rawExp));
      const newSize = Math.min(
        max,
        Math.max(min, wheelFontSizeRef.current * Math.pow(2, clampedExp)),
      );
      wheelFontSizeRef.current = newSize;
      const first = !isZoomingRef.current;
      isZoomingRef.current = true;
      saveRef.current(newSize, first);

      clearTimeout(zoomEndTimer);
      zoomEndTimer = setTimeout(() => {
        isZoomingRef.current = false;
      }, 200);
    };

    // Use capture + earliest possible registration to fire before
    // @use-gesture's listeners.
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      clearTimeout(zoomEndTimer);
    };
  }, [disabled, min, max, wheelSpeed]);

  // usePinch: handles touch pinch gestures only (ctrl+wheel is blocked
  // by the native listener above via stopImmediatePropagation).
  usePinch(
    (state) => {
      const { first, offset } = state;
      if (state.first) {
        isZoomingRef.current = true;
      } else if (state.last) {
        isZoomingRef.current = false;
      }
      lastOffsetRef.current = offset[0];
      const s = (offset[0] - 1) / pinchMax;
      saveRef.current(min + s * (max - min), first);
    },
    {
      target,
      scaleBounds: { min: 1, max: pinchMax + 1 },
      axis: "lock",
      from: () => {
        const fontSize =
          getFontSizeRef.current?.() ?? (max + min) / 2;
        const s = (fontSize - min) / (max - min);
        return [pinchMax * s + 1, 0];
      },
      disabled,
    },
  );

  return isZoomingRef;
}
