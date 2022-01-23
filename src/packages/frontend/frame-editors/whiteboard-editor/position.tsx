import { CSSProperties } from "react";

export default function Position({ children, x, y, z, scale }) {
  const style: CSSProperties = {
    left: x,
    top: y,
    position: "absolute",
    zIndex: z,
  };
  let transform = "";
  if (scale) {
    transform += ` scale(${scale}) `;
  }
  if (transform) {
    style.transformOrigin = "top left";
    style.transform = transform;
  }

  return <div style={style}>{children}</div>;
}
