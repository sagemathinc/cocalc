/*
Supporting component for making focused element(s) resizable.

*/

import { Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "./types";
import { CSSProperties, useState } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";
import Draggable from "react-draggable";
import { getPosition } from "./math";

const baseHandleSize = 20;
const handleColor = "#888";
const handleSize = `${baseHandleSize}px`;
const handleOffset = `-${baseHandleSize / 2}px`;

const dragHandleCursors = {
  "true-true": "nwse-resize",
  "true-false": "nesw-resize",
  "false-true": "nesw-resize",
  "false-false": "nwse-resize",
};

export default function DragHandle({
  top,
  left,
  setOffset,
  canvasScale,
  element,
}: {
  top: boolean;
  left: boolean;
  setOffset: (offset: { x: number; y: number; w: number; h: number }) => void;
  canvasScale: number;
  element: Element;
}) {
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const frame = useFrameContext();
  const style = {
    pointerEvents: "all", // because we turn off pointer events for containing div
    cursor: dragHandleCursors[`${top}-${left}`],
    position: "absolute",
    background: "white",
    color: handleColor,
    fontSize: handleSize,
    zIndex: 1000,
  } as CSSProperties;
  if (top) {
    style.top = handleOffset;
  } else {
    style.bottom = handleOffset;
  }
  if (left) {
    style.left = handleOffset;
  } else {
    style.right = handleOffset;
  }
  function getOffset(data): { x: number; y: number; w: number; h: number } {
    if (top && left) {
      return {
        x: data.x,
        y: data.y,
        w: -data.x,
        h: -data.y,
      };
    }
    if (top && !left) {
      return {
        x: 0,
        y: data.y,
        w: data.x,
        h: -data.y,
      };
    }
    if (!top && left) {
      return { x: data.x, y: 0, w: -data.x, h: data.y };
    }
    if (!top && !left) {
      return { x: 0, y: 0, w: data.x, h: data.y };
    }
    throw Error("impossible");
  }

  return (
    <Draggable
      scale={canvasScale}
      position={position}
      onDrag={(_, data) => {
        setPosition(data);
        setOffset(getOffset(data));
      }}
      onStop={(_, data) => {
        const actions = frame.actions as Actions;
        let { w, h, x, y } = getPosition(element);
        const offset = getOffset(data);
        w += offset.w;
        h += offset.h;
        x += offset.x;
        y += offset.y;

        setTimeout(() => {
          setPosition({ x: 0, y: 0 });
          setOffset({ x: 0, y: 0, w: 0, h: 0 });
          actions.setElement({ id: element.id, x, y, w, h });
        }, 0);
      }}
    >
      <Tooltip title="Resize">
        <Icon className="nodrag" style={style} name="square" />
      </Tooltip>
    </Draggable>
  );
}
