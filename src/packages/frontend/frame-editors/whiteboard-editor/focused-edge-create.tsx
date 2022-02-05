/*
Supporting component for creating an edge.

*/

import { Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "./types";
import { CSSProperties } from "react";
import { MAX_ELEMENTS, DEFAULT_WIDTH, DEFAULT_HEIGHT } from "./math";
import { SELECTED_BORDER_COLOR } from "./focused";
import { useFrameContext } from "./hooks";

const SIZE = 12;
const OFFSET = -SIZE / 2;
const OFFSET_PX = `${OFFSET}px`;

export type Position = "top" | "bottom" | "left" | "right";

interface Props {
  position: Position;
  canvasScale: number;
  element: Element;
}

export default function EdgeCreate({ position, canvasScale, element }: Props) {
  const { actions, id } = useFrameContext();
  const style = {
    pointerEvents: "all", // because we turn off pointer events for containing div
    position: "absolute",
    color: SELECTED_BORDER_COLOR,
    fontSize: `${SIZE}px`,
    zIndex: MAX_ELEMENTS + 15,
    transform: `scale(${1 / canvasScale})`,
    cursor: "pointer",
  } as CSSProperties;
  const h = element.h ?? DEFAULT_HEIGHT;
  const w = element.w ?? DEFAULT_WIDTH;
  if (position == "top") {
    style.top = OFFSET_PX;
    style.left = `${w / 2 + OFFSET}px`;
  } else if (position == "bottom") {
    style.bottom = OFFSET_PX;
    style.left = `${w / 2 + OFFSET}px`;
  } else if (position == "left") {
    style.top = `${h / 2 + OFFSET}px`;
    style.left = OFFSET_PX;
  } else if (position == "right") {
    style.top = `${h / 2 + OFFSET}px`;
    style.right = OFFSET_PX;
  }

  return (
    <Tooltip title="Create edge">
      <Icon
        className="nodrag"
        style={style}
        name="circle"
        onClick={() => {
          actions.setEdgeCreateStart(id, element.id, position);
        }}
      />
    </Tooltip>
  );
}
