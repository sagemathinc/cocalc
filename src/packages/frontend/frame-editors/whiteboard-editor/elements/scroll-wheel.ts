/*

Hook to get the scroll wheel *if* this element is scrollable.  Otherwise,
the wheel events still go to the canvas, making scrolling around easier.

If param always is true, captures scrolling no matter what.

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
