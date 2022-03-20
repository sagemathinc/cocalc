/*
Pinch to zoom support

Usage:  put

usePinchToZoom({target:ref to thing to scroll, min, max})

This usePinch makes it so 2-finger pinch zoom gestures just modify the font
size for the visible canvas, instead of zooming the whole page itself.

*/

import { MutableRefObject, useMemo, useRef } from "react";
import { useFrameContext } from "./frame-context";
import { usePinch, useWheel } from "@use-gesture/react";
import { throttle } from "lodash";
import { IS_MACOS } from "@cocalc/frontend/feature";

export const ZOOM100 = 14;
export function fontSizeToZoom(size?: number): number {
  return size ? size / ZOOM100 : 1;
}

// I'm just setting these globally for the application.  It seems to
// never be a good idea, and this keeps behavior not subtly changed
// depending on what editors are open!
const handler = (e) => {
  e.preventDefault();
};
document.addEventListener("gesturestart", handler);
document.addEventListener("gesturechange", handler);
document.addEventListener("gestureend", handler);

interface Data {
  fontSize: number;
}

const pinchMax = 10000000;

export default function usePinchToZoom({
  target,
  min = 5,
  max = 100,
  onZoom,
  throttleMs = 50,
  smooth = 5,
  disabled,
  getFontSize,
}: {
  target: MutableRefObject<any>; // reference to element that we want pinch zoom.
  min?: number;
  max?: number;
  onZoom?: (Data) => void; // if given, then font size is NOT set via actions.
  throttleMs?: number;
  smooth?: number;
  disabled?: boolean;
  getFontSize?: () => number; // function that gets current font size for application; useful so that zoom starts at out right value, in case changed externally
}) {
  const { actions, id } = useFrameContext();

  const saveThrottled = useMemo(() => {
    if (disabled) return () => {};
    return throttle((fontSize, first) => {
      if (onZoom != null) {
        onZoom({
          fontSize,
          first,
        });
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

  useWheel(
    (state) => {
      if (state.event.ctrlKey) {
        if (state.first) {
          isZoomingRef.current = true;
        } else if (state.last) {
          isZoomingRef.current = false;
        }
        // prevent the entire window scrolling on windows or with a mouse.
        state.event.preventDefault();
        save(max - state.offset[1] / smooth, state.first);
      }
    },
    {
      enabled: !IS_MACOS, // the wheel (even with a mouse wheel) conflicts with pinch on MacOS; on windows get only wheel and no pinch.
      target,
      eventOptions: { passive: false, capture: true },
      bounds: { top: 0, bottom: (max - min) * smooth },
      disabled,
    }
  );

  const lastOffsetRef = useRef<number>(100);

  const isZoomingRef = useRef<boolean>(false);
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
      save(min + s * (max - min), first);
    },
    {
      target,
      scaleBounds: { min: 1, max: pinchMax + 1 },
      axis: "x",
      from: () => {
        if (getFontSize != null) {
          const fontSize = getFontSize();
          // need that      fontSize = min + s*(max-min), where s =(offset[0] - 1)/pinchMax
          // Solve for offset[0] and return that.
          //  s = (fontSize - min) / (max - min) = (offset[0] - 1) / pinchMax, so
          //  offset[0] = pinchMax * s + 1.
          const s = (fontSize - min) / (max - min);
          return [pinchMax * s + 1];
        }
        // TODO: this needs to return current font size / scale but in terms of our scale bounds param.
        // This is the zoom level that we start with whenever we start pinching.
        return [lastOffsetRef.current, 0];
      },
      disabled,
    }
  );

  return isZoomingRef;
}
