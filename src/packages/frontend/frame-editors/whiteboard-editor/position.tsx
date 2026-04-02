import { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  style?: CSSProperties;
}

export default function Position({ children, x, y, z, w, h, style }: Props) {
  const posStyle: CSSProperties = {
    position: "absolute",
    left: isFinite(x) ? x : 0, // just be a bit overly robust so things don't get lost in case of corrupt data...
    top: isFinite(y) ? y : 0,
    width: `${w}px`,
    height: `${h}px`,
    zIndex: z,
  };
  return <div style={{ ...style, ...posStyle }}>{children}</div>;
}
