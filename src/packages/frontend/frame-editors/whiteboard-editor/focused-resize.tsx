/*
Supporting component for making focused element(s) resizable.

*/

import { Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "./types";
import { CSSProperties, useState } from "react";
import { useFrameContext } from "./hooks";
import Draggable from "react-draggable";
import { getPosition, MAX_ELEMENTS } from "./math";
import { aspectRatioToNumber } from "./tools/frame";
import { SELECTED_PADDING, SELECTED_BORDER_WIDTH } from "./elements/style";

const BORDER = SELECTED_PADDING + SELECTED_BORDER_WIDTH;

const baseHandleSize = 20;
const handleColor = "#888";
const handleSize = `${baseHandleSize}px`;
const handleOffset = -baseHandleSize / 2;

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
  selectedElements,
}: {
  top: boolean;
  left: boolean;
  setOffset: (offset: { x: number; y: number; w: number; h: number }) => void;
  canvasScale: number;
  element: Element;
  selectedElements: Element[];
}) {
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const frame = useFrameContext();

  if (selectedElements.length != 1) {
    return null;
  }

  const style = {
    pointerEvents: "all", // because we sometimes turn off pointer events for containing div
    cursor: dragHandleCursors[`${top}-${left}`],
    position: "absolute",
    background: "white",
    color: handleColor,
    fontSize: handleSize,
    zIndex: MAX_ELEMENTS + 15,
    transform: `scale(${1 / canvasScale})`,
  } as CSSProperties;
  if (top) {
    style.top = `${handleOffset - BORDER}px`;
  } else {
    style.bottom = `${handleOffset + BORDER}px`;
  }
  if (left) {
    style.left = `${handleOffset - BORDER}px`;
  } else {
    style.right = `${handleOffset + BORDER}px`;
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
        let { w, h, x, y } = getPosition(element);
        const offset = getOffset(data);

        const scale_x = (offset.w + w) / w;
        const scale_y = (offset.h + h) / h;
        w += offset.w;
        h += offset.h;
        x += offset.x;
        y += offset.y;

        if (element.data?.aspectRatio) {
          // We just preserve aspect ratio after drag.
          // TODO: Obviously, we should also preseve aspect ratio
          // during the drag.
          const ar = aspectRatioToNumber(element.data?.aspectRatio);
          if (ar) {
            h = w / ar;
          }
        }

        setTimeout(() => {
          setPosition({ x: 0, y: 0 });
          setOffset({ x: 0, y: 0, w: 0, h: 0 });
          if (element.type == "pen" && element.data?.path) {
            // it would be better to move this code and have
            // a generic plugin mechanism that gets called at this point.
            const path: number[] = [];
            for (let i = 0; i < element.data.path.length; i += 2) {
              path[i] = element.data.path[i] * scale_x;
              path[i + 1] = element.data.path[i + 1] * scale_y;
            }
            frame.actions.setElement({
              obj: {
                id: element.id,
                x,
                y,
                w,
                h,
                data: { ...element.data, path },
              },
              cursors: [{}],
            });
          } else {
            frame.actions.setElement({
              obj: { id: element.id, x, y, w, h },
              cursors: [{}],
            });
          }
        }, 0);
      }}
    >
      <Tooltip title="Resize">
        <Icon className="nodrag" style={style} name="square" />
      </Tooltip>
    </Draggable>
  );
}
