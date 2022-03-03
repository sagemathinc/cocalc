/*
Pinch to zoom support

Usage:  put

usePinchToZoom({target:ref to thing to scroll, min, max})

This usePinch makes it so 2-finger pinch zoom gestures just modify the font
size for the visible canvas, instead of zooming the whole page itself.

*/

import { MutableRefObject, useMemo } from "react";
import { useFrameContext } from "./frame-context";
import { usePinch } from "@use-gesture/react";
import { throttle } from "lodash";

// I'm just setting these globally for the application.  It seems to
// never be a good idea, and this keeps behavior not subtly changed
// depending on what editors are open!
const handler = (e) => e.preventDefault();
document.addEventListener("gesturestart", handler);
document.addEventListener("gesturechange", handler);

export default function usePinchToZoom({
  target,
  min = 5,
  max = 100,
}: {
  target: MutableRefObject<any>; // reference to element that we want pinch zoom.
  min?: number;
  max?: number;
  step?: number;
}) {
  const { actions, id } = useFrameContext();

  const save = useMemo(() => {
    return throttle((fontSize) => {
      actions.set_font_size(id, fontSize);
    }, 50);
  }, [id]);

  usePinch(
    (state) => {
      const { offset } = state;
      save(Math.round(offset[0] * min));
    },
    {
      target,
      scaleBounds: { min: 1, max: max / min },
    }
  );
}
