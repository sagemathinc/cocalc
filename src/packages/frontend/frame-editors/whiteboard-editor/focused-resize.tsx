/*
Supporting component for making focused element(s) resizable.

*/

import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "./types";
import { CSSProperties, useState } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";
import Draggable from "react-draggable";
import { getPosition } from "./math";

const baseCircleSize = 14;
const circleColor = "#888";
const circleSize = `${baseCircleSize}px`;
const circleOffset = `-${baseCircleSize / 2}px`;
const dragHandleCursors = {
  "true-true": "nwse-resize",
  "true-false": "nesw-resize",
  "false-true": "nesw-resize",
  "false-false": "nwse-resize",
};

export default function DragHandle({
  top,
  left,
  canvasScale,
  element,
}: {
  top?: boolean;
  left?: boolean;
  canvasScale: number;
  element: Element;
}) {
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const frame = useFrameContext();
  const style = {
    cursor: dragHandleCursors[`${top}-${left}`],
    position: "absolute",
    background: "white",
    color: circleColor,
    fontSize: circleSize,
    zIndex: 1000,
  } as CSSProperties;
  if (top) {
    style.top = circleOffset;
  } else {
    style.bottom = circleOffset;
  }
  if (left) {
    style.left = circleOffset;
  } else {
    style.right = circleOffset;
  }
  return (
    <Draggable
      scale={canvasScale}
      position={position}
      onDrag={(_, data) => {
        setPosition(data);
      }}
      onStop={(_, data) => {
        const actions = frame.actions as Actions;
        let { w, h, x, y } = getPosition(element);
        if (top && left) {
          x += data.x;
          y += data.y;
          w -= data.x;
          h -= data.y;
        } else if (top && !left) {
          y += data.y;
          w += data.x;
          h -= data.y;
        } else if (!top && left) {
          x += data.x;
          w -= data.x;
          h += data.y;
        } else if (!top && !left) {
          w += data.x;
          h += data.y;
        }
        setTimeout(() => actions.setElement({ id: element.id, x, y, w, h }), 0);
        setPosition({ x: 0, y: 0 });
      }}
    >
      <Icon className="nodrag" style={style} name="square" />
    </Draggable>
  );
}
