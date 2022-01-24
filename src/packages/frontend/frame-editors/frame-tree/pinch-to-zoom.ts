/*
Pinch to zoom support

Usage:  put

usePinchToZoom({target:ref to thing to scroll, min, max})

This usePinch makes it so 2-finger pinch zoom gestures just modify the font
size for the visible canvas, instead of zooming the whole page itself.

*/

import { MutableRefObject } from "react";
import { useFrameContext } from "./frame-context";
import { usePinch } from "@use-gesture/react";

// I'm just setting these globally for the application.  It seems to
// never be a good idea, and this keeps behavior not subtly changed
// depending on what editors are open!
const handler = (e) => e.preventDefault();
document.addEventListener("gesturestart", handler);
document.addEventListener("gesturechange", handler);
document.addEventListener("gestureend", handler);

export default function usePinchToZoom({
  target,
  min,
  max,
}: {
  target: MutableRefObject<any>; // reference to element that we want pinch zoom.
  min?: number;
  max?: number;
}) {
  const { actions, id, desc } = useFrameContext();

  /*
  useEffect(() => {
    // This is needed on iOS/iPadOS in order to stop the global pinch-to-zoom
    // from messing up the usePinch gesture.  It has some slight impact on the
    // rest of cocalc of course, when any whiteboard is opened.
    const handler = (e) => e.preventDefault();
    document.addEventListener("gesturestart", handler);
    document.addEventListener("gesturechange", handler);
    document.addEventListener("gestureend", handler);
    return () => {
      document.removeEventListener("gesturestart", handler);
      document.removeEventListener("gesturechange", handler);
      document.removeEventListener("gestureend", handler);
    };
  }, []); */

  usePinch(
    (state) => {
      actions.set_font_size(
        id,
        Math.min(
          max ?? 100,
          Math.max(
            min ?? 5, // todo -- maybe 14 needs to be got from store?
            (desc.get("font_size") ?? 14) + (state.delta[0] < 0 ? -1 : 1)
          )
        )
      );
    },
    {
      target,
    }
  );
}
