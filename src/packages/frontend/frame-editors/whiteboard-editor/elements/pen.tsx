/*
Render a pen element.
*/

import { useEffect, useRef } from "react";
import type { Element, Point } from "../types";
import { decompressPath, midPoint } from "../math";

interface Props {
  element: Element;
}

const DPIFactor = 4;

export default function Pen({ element }: Props) {
  const canvasRef = useRef<any>(null);
  // We pad to shift things just a little so that parts of the curve that
  // are right on the edge of the canvas don't get partially truncated.
  // I tried doing this at various points in "the pipeline", and here at
  // the renderer is optimal.
  const pad = 2 * (element.data?.["radius"] ?? 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const ctx = canvas.getContext("2d");
    if (ctx == null) return;
    ctx.restore();
    ctx.save();
    ctx.scale(DPIFactor, DPIFactor);
    ctx.translate(pad, pad);
  }, [pad, element.w, element.h]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const ctx = canvas.getContext("2d");
    if (ctx == null) return;
    const data:
      | { path?: number[]; color?: string; radius?: number; opacity?: number }
      | undefined = element.data;
    if (data == null) return;
    const { path, radius, color, opacity } = data;
    if (path == null) return;
    clearCanvas({ ctx });
    drawCurve({
      ctx,
      path: decompressPath(path),
      color: color ?? "black",
      radius: radius ?? 1,
      opacity,
    });
  }, [element]);

  const w = (element.w ?? 100) + 2 * pad;
  const h = (element.h ?? 100) + 2 * pad;
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={w * DPIFactor}
        height={h * DPIFactor}
        style={{
          width: `${w}px`,
          height: `${h}px`,
          position: "absolute",
          top: -pad,
          left: -pad,
        }}
      />
    </div>
  );
}

export function clearCanvas({ ctx }) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawCurve({
  ctx,
  path,
  color,
  radius,
  opacity,
}: {
  ctx;
  path: Point[];
  color: string;
  radius: number;
  opacity?: number;
}) {
  // There's some useful MIT licensed code at https://github.com/embiem/react-canvas-draw
  // that inspired this.
  if (path.length <= 1) return;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  if (opacity) {
    ctx.globalAlpha = opacity;
  }

  ctx.lineWidth = 2*radius;

  let p1 = path[0];
  let p2 = path[1];

  ctx.moveTo(p2.x, p2.y);
  ctx.beginPath();

  for (let i = 1, len = path.length; i < len; i++) {
    // we pick the point between pi+1 & pi+2 as the
    // end point and p1 as our control point
    const { x, y } = midPoint(p1, p2);
    ctx.quadraticCurveTo(p1.x, p1.y, x, y);
    p1 = path[i];
    p2 = path[i + 1];
  }
  // Draw last line as a straight line.
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}
