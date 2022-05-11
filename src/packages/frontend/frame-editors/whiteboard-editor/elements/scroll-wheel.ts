/*

Hook to get the scroll wheel *if* this element is scrollable.  Otherwise,
the wheel events still go to the canvas, making scrolling around easier.

If param always is true, captures scrolling no matter what.

TODO: we could make it so that if you attempt to scroll and nothing happens, because
you're at the edge, then scroll of the whole canvas occurs instead.  That might
be really good/usable, or really annoying - I'm not sure.
*/

import { useWheel } from "@use-gesture/react";
import { RefObject } from "react";

export default function useScrollWheel(
  divRef: RefObject<HTMLDivElement>,
  always: boolean = false
) {
  useWheel(
    (state) => {
      const elt = divRef.current;
      if (elt != null) {
        if (
          always ||
          elt.scrollWidth > elt.clientWidth ||
          elt.scrollHeight > elt.clientHeight
        ) {
          // scrollable -- so make the wheel impact the code, rather than the canvas.
          state.event.stopPropagation();
        }
      }
    },
    {
      target: divRef,
      eventOptions: { passive: false, capture: true },
    }
  );
}
