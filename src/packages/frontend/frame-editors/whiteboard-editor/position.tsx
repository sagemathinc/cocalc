import { CSSProperties } from "react";

export default function Position({ children, x, y, z, w, h, scale }) {
  const style: CSSProperties = {
    left: x,
    top: y,
    width: w ? `${w}px` : undefined,
    height: h ? `${h}px` : undefined,
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
