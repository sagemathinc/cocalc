/*
Hook to better track clicks versus drags to assist in:
  - click on object to select
  - click on selected object to edit
  - drag selected object to move
*/

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
