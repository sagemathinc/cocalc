import { CSSProperties } from "react";

export default function Position({ children, x, y, z, w, h }) {
  const style: CSSProperties = {
    left: x,
    top: y,
    width: w ? `${w}px` : undefined,
    height: h ? `${h}px` : undefined,
    position: "absolute",
    zIndex: z,
  };
  return <div style={style}>{children}</div>;
}
