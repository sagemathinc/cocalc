/*
Displays focused element with a border around it.

NOTE that this is HTML and border width must be at least 1px.
Given our CSS scale before this, if the scale is bigger than 2
then the border will be too wide.  We'll probably have to redo
things to fix that later.
*/

import { CSSProperties } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
const padding = 15;
const thickness = 2;
const color = "#40a9ff";
const baseCircleSize = 14;
const circleColor = "#888";

export default function Focused({ children, scale }) {
  scale = scale ?? 1;
  const circleSize = `${baseCircleSize / scale}px`;
  const circleOffset = `-${baseCircleSize / scale / 2}px`;

  function DragHandle({ top, left, bottom, right, scale, cursor }) {
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
    return <Icon style={style} name="square" />;
  }

  function Rotate() {
    return (
      <Icon
        style={{
          background: "white",
          fontSize: `${24 / scale}px`,
          cursor: "grab",
          position: "absolute",
          bottom: `-${(4 * baseCircleSize) / scale}px`,
          left: `-${(4 * baseCircleSize) / scale}px`,
        }}
        name="reload"
      />
    );
  }

  return (
    <div
      style={{
        cursor: "grab",
        zIndex: 10000, // very large above everything so can always grab
        position: "relative",
        border: `${thickness / scale}px dashed ${color}`,
        padding: `${padding / scale}px`,
        marginLeft: `${(-padding - thickness) / scale}px`, // to offset border and padding, so object
        marginTop: `${(-padding - thickness) / scale}px`, // doesn't appear to move when selected
      }}
    >
      <DragHandle top left cursor="nwse-resize" />
      <DragHandle top right cursor="nesw-resize" />
      <DragHandle bottom left cursor="nesw-resize" />
      <DragHandle bottom right cursor="nwse-resize" />
      <Rotate />
      <div style={{ cursor: "text" }}>{children}</div>
    </div>
  );
}
