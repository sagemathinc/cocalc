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
    left: x,
    top: y,
    width: `${w}px`,
    height: `${h}px`,
    zIndex: z,
  };
  return <div style={{ ...style, ...posStyle }}>{children}</div>;
}
