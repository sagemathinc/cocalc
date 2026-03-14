import { CSSProperties } from "react";
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

  // Sharp arrowhead: length along the arrow direction, width perpendicular
  const tipLength = arrowSize * 0.7;
  const tipWidth = arrowSize * 0.45;

  return (
    <div
      onClick={onClick}
      style={{
        // Only positioning and rotation on the outer div — no padding,
        // margin, or border, which would shift the rotation pivot.
        position: "absolute",
        left: x0,
        top: y0,
        width: `${len}px`,
        transformOrigin: "0 0",
        transform: `rotate(${theta}rad)`,
        zIndex: style?.zIndex as any,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {/* Invisible click hit area (wider than the line) */}
      {onClick && (
        <div
          style={{
            position: "absolute",
            top: "-10px",
            left: 0,
            right: 0,
            height: "20px",
          }}
        />
      )}
      {/* The actual line */}
      <div
        style={{
          position: "relative",
          borderTop: `${Math.max(thickness, 1)}px ${preview ? "dashed" : "solid"} ${color}`,
          opacity,
        }}
      >
        {/* Sharp SVG arrowhead */}
        <svg
          style={{
            position: "absolute",
            right: 0,
            top: `-${tipWidth / 2}px`,
          }}
          width={tipLength}
          height={tipWidth}
          viewBox={`0 0 ${tipLength} ${tipWidth}`}
        >
          <polygon
            points={`0,0 ${tipLength},${tipWidth / 2} 0,${tipWidth}`}
            fill={color}
            opacity={opacity}
          />
        </svg>
      </div>
    </div>
  );
}
