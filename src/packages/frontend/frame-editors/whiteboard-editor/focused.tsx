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
import { Element } from "./types";
import DragHandle from "./focused-resize";

const thickness = 2;
const color = "#40a9ff";
const OFFSET = 50;

interface Props {
  children: CSSProperties;
  canvasScale: number;
  element: Element;
}

export default function Focused({ children, canvasScale, element }: Props) {
  const frame = useFrameContext();
  const rectRef = useRef<any>(null);
  const [rotating, setRotating] = useState<number | undefined>(undefined);

  const dragHandles = useMemo(() => {
    const v: ReactNode[] = [];
    for (const top of [true, false]) {
      for (const left of [true, false]) {
        v.push(
          <DragHandle
            top={top}
            left={left}
            canvasScale={canvasScale}
            element={element}
          />
        );
      }
    }
    return v;
  }, [element, canvasScale]);

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
        x: -OFFSET / s - width / 2,
        y: OFFSET / s + height / 2,
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
            bottom: `-${OFFSET}px`,
            left: `-${OFFSET}px`,
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
          {dragHandles}
          {RotateControl}
          <div
            className="nodrag"
            style={{
              position: "absolute",
              bottom: `-${OFFSET}px`,
              right: `-${OFFSET}px`,
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
