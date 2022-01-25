/*
Displays focused element with a border around it.

NOTE that this is HTML and border width must be at least 1px.
Given our CSS scale before this, if the scale is bigger than 2
then the border will be too wide.  We'll probably have to redo
things to fix that later.
*/

import { CSSProperties, useMemo, useRef, useState } from "react";
import Draggable from "react-draggable";
import { getAngle } from "./math";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";
import EditBar from "./tools/edit-bar";

const padding = 30;
const thickness = 2;
const color = "#40a9ff";
const baseCircleSize = 14;
const circleColor = "#888";

export default function Focused({ children, scale, canvasScale, element }) {
  const frame = useFrameContext();
  const rectRef = useRef<any>(null);
  const [rotating, setRotating] = useState<number | undefined>(undefined);
  scale = scale ?? 1;
  const circleSize = `${baseCircleSize / scale}px`;
  const circleOffset = `-${baseCircleSize / scale / 2}px`;

  function DragHandle({
    top,
    left,
    bottom,
    right,
    cursor,
  }: {
    top?: boolean;
    left?: boolean;
    bottom?: boolean;
    right?: boolean;
    cursor: string;
  }) {
    const style = {
      cursor,
      position: "absolute",
      background: "white",
      color: circleColor,
      fontSize: circleSize,
    } as CSSProperties;
    if (top) style.top = circleOffset;
    if (left) style.left = circleOffset;
    if (bottom) style.bottom = circleOffset;
    if (right) style.right = circleOffset;
    return (
      <Draggable
        scale={canvasScale * scale}
        onStart={(_, data) => {
          console.log("start drag", data);
        }}
        onDrag={(_, data) => {
          console.log("drag", data);
        }}
        onStop={(_, data) => {
          console.log("stop drag", data);
        }}
      >
        <Icon className="nodrag" style={style} name="square" />
      </Draggable>
    );
  }

  // useMemo is critical here because we don't want this
  // component to get re-rendered as a result of it calling
  // setRotating internally below to update the preview.
  const RotateControl = useMemo(() => {
    function computeAngle(data) {
      const rect = rectRef.current;
      if (!rect) return;
      const { height, width } = rect.getBoundingClientRect();
      const s = canvasScale * scale;
      const start = {
        x: -(4 * baseCircleSize) / s - width / 2,
        y: (4 * baseCircleSize) / s + height / 2,
      };
      const stop = {
        x: start.x + data.x * (canvasScale * Math.max(1, scale)),
        y: start.y + data.y * (canvasScale * Math.max(1, scale)),
      };
      return getAngle(stop) - getAngle(start);
    }
    return (
      <Draggable
        position={{ x: 0, y: 0 }}
        scale={canvasScale * scale}
        onDrag={(_, data) => {
          setRotating(computeAngle(data));
        }}
        onStop={(_, data) => {
          const angle = computeAngle(data);
          if (angle == null) return;
          const { id, rotate } = element;
          const actions = frame.actions as Actions;
          setTimeout(() => {
            setRotating(undefined);
            actions.setElement({ id, rotate: parseFloat(rotate ?? 0) + angle });
          }, 0);
        }}
      >
        <Icon
          className="nodrag"
          style={{
            color: "#888",
            background: "white",
            fontSize: `${24 / scale}px`,
            cursor: "grab",
            position: "absolute",
            bottom: `-${(4 * baseCircleSize) / scale}px`,
            left: `-${(4 * baseCircleSize) / scale}px`,
          }}
          name="reload"
        />
      </Draggable>
    );
  }, [element.rotate]);

  return (
    <Draggable
      cancel={".nodrag"}
      position={{ x: 0, y: 0 }}
      scale={canvasScale * scale}
      onStop={(_, data) => {
        const { id } = element;
        const x = element.x + data.x * scale;
        const y = element.y + data.y * scale;
        const actions = frame.actions as Actions;
        actions.setElement({ id, x, y });
      }}
    >
      <div
        ref={rectRef}
        style={{
          cursor: "grab",
          position: "relative",
          border: `${thickness / scale}px dashed ${color}`,
          marginLeft: `${-thickness / scale}px`, // to offse padding, so object
          marginTop: `${-thickness / scale}px`, // doesn't appear to move when selected
        }}
      >
        <div>
          <DragHandle top left cursor="nwse-resize" />
          <DragHandle top right cursor="nesw-resize" />
          <DragHandle bottom left cursor="nesw-resize" />
          <DragHandle bottom right cursor="nwse-resize" />
          {RotateControl}
          <div
            className="nodrag"
            style={{
              position: "absolute",
              bottom: `-${(4 * baseCircleSize) / scale}px`,
              right: `-${(4 * baseCircleSize) / scale}px`,
            }}
          >
            <EditBar elements={[element]} />
          </div>
          <div
            style={{
              ...(rotating
                ? {
                    transform: `rotate(${rotating}rad)`,
                    transformOrigin: "center",
                  }
                : undefined),
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </Draggable>
  );
}
