/*
Pinch to zoom support

Usage:  put

usePinchToZoom({target:ref to thing to scroll, min, max})

This usePinch makes it so 2-finger pinch zoom gestures just modify the font
size for the visible canvas, instead of zooming the whole page itself.

*/

import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useFrameContext } from "./frame-context";
import { usePinch, useWheel } from "@use-gesture/react";
import { throttle } from "lodash";
import { IS_MACOS } from "@cocalc/frontend/feature";

interface Point {
  x: number;
  y: number;
}

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
  curMouse: Point | null;
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
  onZoom?: (Data) => void; // not throttled at all; if given, then font size is NOT set via actions.
  throttleMs?: number;
  smooth?: number;
}) {
  const { actions, id } = useFrameContext();

  const scaleRef = useRef<any>(0);
  const curMouse = useRef<Point | null>(null);
  const onMouseMove = useCallback(
    (event) => {
      const rect = target.current?.getBoundingClientRect();
      if (rect == null) return;
      curMouse.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      if (event.shiftKey) {
        console.log(
          curMouse.current,
          scaleRef.current,
          JSON.stringify({
            clientX: event.clientX,
            clientY: event.clientY,
            rect,
          })
        );
      }
    },
    [target]
  );

  useEffect(() => {
    if (target.current == null) return;
    target.current.addEventListener("mousemove", onMouseMove);
    return () => {
      target.current?.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  const saveThrottled = useMemo(() => {
    return throttle((fontSize) => {
      //} else {
      actions.set_font_size(id, fontSize);
      //}
    }, throttleMs);
  }, [id]);

  const save = useMemo(() => {
    return (fontSize) => {
      scaleRef.current = fontSizeToZoom(fontSize);
      if (onZoom != null) {
        onZoom({
          fontSize,
          curMouse: curMouse.current,
        });
        return;
      }
      saveThrottled(fontSize);
    };
  }, [id]);

  useWheel(
    (state) => {
      if (state.event.ctrlKey) {
        // prevent the entire window scrolling on windows or with a mouse.
        state.event.preventDefault();
        save(max - state.offset[1] / smooth);
      }
    },
    {
      enabled: !IS_MACOS, // the wheel (even with a mouse wheel) conflicts with pinch on MacOS; on windows get only wheel and no pinch.
      target,
      eventOptions: { passive: false, capture: true },
      bounds: { top: 0, bottom: (max - min) * smooth },
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
