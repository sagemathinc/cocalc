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

export default function usePinchToZoom({
  target,
  min = 5,
  max = 100,
  onZoom,
  throttleMs = 50,
  smooth = 5,
}: {
  target: MutableRefObject<any>; // reference to element that we want pinch zoom.
  min?: number;
  max?: number;
  onZoom?: (Data) => void; // if given, then font size is NOT set via actions.
  throttleMs?: number;
  smooth?: number;
}) {
  const { actions, id } = useFrameContext();

  const saveThrottled = useMemo(() => {
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
    return (fontSize, first) => {
      saveThrottled(fontSize, first);
    };
  }, [id]);

  useWheel(
    (state) => {
      if (state.event.ctrlKey) {
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
    }
  );

  const lastOffsetRef = useRef<number>(100);
  usePinch(
    (state) => {
      const { first, offset } = state;
      lastOffsetRef.current = offset[0];
      const s = (offset[0] - 1) / 1000;
      save(min + s * (max - min), first);
    },
    {
      target,
      scaleBounds: { min: 1, max: 1001 },
      axis: "x",
      from: () => {
        // TODO: this needs to return current font size / scale but in terms of our scale bounds param.
        // This is the zoom level that we start with whenever we start pinching.
        return [lastOffsetRef.current, 0];
      },
    }
  );
}
