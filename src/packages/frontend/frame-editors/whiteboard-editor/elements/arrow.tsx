import { CSSProperties } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import type { Point } from "../types";

interface Props {
  start: Point;
  end: Point;
  arrowSize?: number;
  thickness?: number;
  color?: string;
  opacity?: number;
  style?: CSSProperties;
  onClick?: (evt: any) => void;
  preview?: boolean;
}

export default function Arrow({
  start,
  end,
  arrowSize = 24,
  thickness = 1,
  color = "black",
  opacity,
  style,
  onClick,
  preview,
}: Props) {
  const { x: x0, y: y0 } = start;
  const { x: x1, y: y1 } = end;
  const a = x1 - x0;
  const b = y1 - y0;
  const len = Math.sqrt(a * a + b * b);
  const theta = Math.atan(b / a) - (a < 0 ? Math.PI : 0);
  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        left: x0,
        top: y0,
        width: `${len}px`,
        transformOrigin: "0 0",
        transform: `rotate(${theta}rad)`,
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          border: `${thickness / 2}px ${preview ? "dashed" : "solid"} ${color}`,
          borderRadius: `${thickness}px`,
          color,
          opacity,
        }}
      >
        <Icon
          name="caret-right"
          style={{
            position: "absolute",
            right: `-${(arrowSize * 3) / 8}px`,
            top: `-${arrowSize / 2}px`,
            fontSize: `${arrowSize}px`,
          }}
        />
      </div>
    </div>
  );
}
