import { CSSProperties } from "react";

export default function Position({ children, x, y, scale, rotate }) {
  const style: CSSProperties = { left: x, top: y, position: "absolute" };
  let transform = "";
  if (rotate) {
    transform += ` rotate(${rotate}) `;
  }
  if (scale) {
    transform += ` scale(${scale}) `;
  }
  if (transform) {
    style.transformOrigin = "top left";
    style.transform = transform;
  }

  return <div style={style}>{children}</div>;
}
