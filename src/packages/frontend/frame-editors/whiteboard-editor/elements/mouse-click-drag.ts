/*
Hook to better track clicks versus drags to assist in:
  - click on object to select
  - click on selected object to edit
  - drag selected object to move
*/

// temporarily disabled, since it causes a serious bug, where you click
// on codemirror editor in a slate editor, and it gets focused after
// the drag, but not in edit mode.  That is very bad, since hitting
// delete key then deletes everything, etc.
export default function useMouseClickDrag(_: any) {
  return undefined;
}

/*
import { useRef } from "react";

export default function useMouseClickDrag({
  editFocus,
  setEditFocus,
}: {
  editFocus: boolean;
  setEditFocus: (state: boolean) => void;
}) {
  const mouseClickRef = useRef<{ moved: boolean; editFocus: boolean }>({
    moved: false,
    editFocus,
  });
  const onMouseDown = () => {
    mouseClickRef.current = { moved: false, editFocus };
  };
  const onMouseMove = () => {
    mouseClickRef.current.moved = true;
  };
  const onMouseUp = () => {
    if (mouseClickRef.current.moved) {
      // mouse moved as part of "click"
      if (!mouseClickRef.current.editFocus) {
        setEditFocus(false);
      }
      return;
    }
    setEditFocus(true);
  };

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onTouchStart: onMouseDown,
    onTouchMove: onMouseMove,
    onTouchEnd: onMouseUp,
  };
}

*/
