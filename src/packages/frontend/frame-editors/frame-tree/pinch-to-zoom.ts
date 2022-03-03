/*
Pinch to zoom support

Usage:  put

usePinchToZoom({target:ref to thing to scroll, min, max})

This usePinch makes it so 2-finger pinch zoom gestures just modify the font
size for the visible canvas, instead of zooming the whole page itself.

*/

import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { useFrameContext } from "./frame-context";
import { usePinch } from "@use-gesture/react";
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
  step?: number;
}) {
  const { actions, id } = useFrameContext();

  //////////////////////////////////////////////
  // custom handling of ctrl+scroll
  // We want pinch-to-zoom to  zoom in and out, but on
  // windows it ctrl + scroll wheel.  On macOS pinch
  // to zoom on the trackpad is just a gesture, so this
  // code doesn't get used.
  const scale = useRef<number>(1);
  const onWheel = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      console.log(e.deltaY);
      scale.current += e.deltaY * -0.01;
      scale.current = Math.min(Math.max(1, scale.current), max / min);
      save(Math.round(scale.current * min));
    }
  }, []);

  useEffect(() => {
    if (target.current == null) return;
    target.current.addEventListener("wheel", onWheel, {
      passive: false,
    });
    return () => {
      target.current?.removeEventListener("wheel", onWheel, {
        passive: false,
      });
    };
  }, []);
  //////////////////////////////////////////////

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
