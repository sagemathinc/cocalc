/*
Displays focused element with a border around it.

NOTE that this is HTML and border width must be at least 1px.
Given our CSS scale before this, if the scale is bigger than 2
then the border will be too wide.  We'll probably have to redo
things to fix that later.
*/

import { CSSProperties, useMemo, useRef, useState } from "react";
import Draggable from "react-draggable";
import { getAngle, DEFAULT_WIDTH, DEFAULT_HEIGHT } from "./math";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";
import EditBar from "./tools/edit-bar";
import { delay } from "awaiting";

const thickness = 5;
const color = "#40a9ff";
const baseCircleSize = 14;
const circleColor = "#888";

export default function Focused({ children, canvasScale, element }) {
  const frame = useFrameContext();
  const rectRef = useRef<any>(null);
  const [rotating, setRotating] = useState<number | undefined>(undefined);
  const circleSize = `${baseCircleSize}px`;
  const circleOffset = `-${baseCircleSize / 2}px`;

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
      zIndex: 1000,
    } as CSSProperties;
    if (top) style.top = circleOffset;
    if (left) style.left = circleOffset;
    if (bottom) style.bottom = circleOffset;
    if (right) style.right = circleOffset;
    return (
      <Draggable
        scale={canvasScale}
        onStart={(_, data) => {
          //console.log("start drag", data);
        }}
        onDrag={(_, data) => {
          //console.log("drag", data);
        }}
        onStop={async (_, data) => {
          const actions = frame.actions as Actions;
          if (bottom && right) {
            // actually do something
            await delay(0);
            actions.setElement({
              id: element.id,
              w: (element.w ?? DEFAULT_WIDTH) + data.x,
              h: (element.h ?? DEFAULT_HEIGHT) + data.y,
            });
          }
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
      const s = canvasScale;
      const start = {
        x: -(4 * baseCircleSize) / s - width / 2,
        y: (4 * baseCircleSize) / s + height / 2,
      };
      const stop = {
        x: start.x + data.x * canvasScale,
        y: start.y + data.y * canvasScale,
      };
      return getAngle(stop) - getAngle(start);
    }
    return (
      <Draggable
        position={{ x: 0, y: 0 }}
        scale={canvasScale}
        onDrag={(_, data) => {
          setRotating(computeAngle(data));
        }}
        onStop={async (_, data) => {
          const angle = computeAngle(data);
          if (angle == null) return;
          const { id, rotate } = element;
          await delay(0);
          const actions = frame.actions as Actions;
          setRotating(undefined);
          actions.setElement({ id, rotate: parseFloat(rotate ?? 0) + angle });
        }}
      >
        <Icon
          className="nodrag"
          style={{
            color: "#888",
            background: "white",
            fontSize: "24px",
            cursor: "grab",
            position: "absolute",
            bottom: `-${4 * baseCircleSize}px`,
            left: `-${4 * baseCircleSize}px`,
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
      scale={canvasScale}
      onStop={(_, data) => {
        const { id } = element;
        const x = element.x + data.x;
        const y = element.y + data.y;
        const actions = frame.actions as Actions;
        actions.setElement({ id, x, y });
      }}
    >
      <div
        ref={rectRef}
        style={{
          cursor: "grab",
          position: "relative",
          border: `${thickness}px dashed ${color}`,
          marginLeft: `${-thickness}px`, // to offse padding, so object
          marginTop: `${-thickness}px`, // doesn't appear to move when selected
          width: "100%",
          height: "100%",
        }}
      >
        <div style={{ width: "100%", height: "100%" }}>
          <DragHandle top left cursor="nwse-resize" />
          <DragHandle top right cursor="nesw-resize" />
          <DragHandle bottom left cursor="nesw-resize" />
          <DragHandle bottom right cursor="nwse-resize" />
          {RotateControl}
          <div
            className="nodrag"
            style={{
              position: "absolute",
              bottom: `-${4 * baseCircleSize}px`,
              right: `-${4 * baseCircleSize}px`,
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
              width: "100%",
              height: "100%",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </Draggable>
  );
}
