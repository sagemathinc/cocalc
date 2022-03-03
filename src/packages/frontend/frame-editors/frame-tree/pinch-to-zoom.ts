/*
Pinch to zoom support

Usage:  put

usePinchToZoom({target:ref to thing to scroll, min, max})

This usePinch makes it so 2-finger pinch zoom gestures just modify the font
size for the visible canvas, instead of zooming the whole page itself.

*/

import { MutableRefObject, useMemo } from "react";
import { useFrameContext } from "./frame-context";
import { usePinch, useWheel } from "@use-gesture/react";
import { throttle } from "lodash";

// I'm just setting these globally for the application.  It seems to
// never be a good idea, and this keeps behavior not subtly changed
// depending on what editors are open!
const handler = (e) => {
  e.preventDefault();
};
document.addEventListener("gesturestart", handler);
document.addEventListener("gesturechange", handler);
document.addEventListener("gestureend", handler);

export default function usePinchToZoom({
  target,
  min = 5,
  max = 100,
}: {
  target: MutableRefObject<any>; // reference to element that we want pinch zoom.
  min?: number;
  max?: number;
}) {
  const { actions, id } = useFrameContext();

  const save = useMemo(() => {
    return throttle((fontSize) => {
      actions.set_font_size(id, Math.round(fontSize));
    }, 50);
  }, [id]);

  useWheel(
    (state) => {
      if (state.event.ctrlKey) {
        // prevent the entire window scrolling on windows or with a mouse.
        state.event.preventDefault();
        save(max - state.offset[1] / 10);
      }
    },
    {
      target,
      eventOptions: { passive: false, capture: true },
      bounds: { top: 0, bottom: (max - min) * 10 },
    }
  );

  usePinch(
    (state) => {
      const { offset } = state;
      save(offset[0] * min);
    },
    {
      target,
      scaleBounds: { min: 1, max: max / min },
    }
  );
}
