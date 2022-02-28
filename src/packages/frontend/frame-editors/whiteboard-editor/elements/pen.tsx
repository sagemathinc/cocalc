/*
Render a pen element.
*/

import { useEffect, useRef } from "react";
import type { Element, Point } from "../types";
import { decompressPath, midPoint } from "../math";

interface Props {
  element: Element;
  renderStatic?: boolean; // if rendering in context of SSR and next.js; forces use of DPI
  // factor = 2 in both frontend and backend, since changing
  // between them breaks hydration badly.
}

// This is enforced by iPad/iOS... but is probably a good idea in general
// to avoid using too much memory and making things slow.
const MAX_CANVAS_SIZE = 4096;

export default function Pen({ element, renderStatic }: Props) {
  const DPIFactor = renderStatic ? 2 : window.devicePixelRatio;
  const canvasRef = useRef<any>(null);
  const scaleRef = useRef<number>(1);
  // We pad to shift things just a little so that parts of the curve that
  // are right on the edge of the canvas don't get partially truncated.
  // I tried doing this at various points in "the pipeline", and here at
  // the renderer is optimal.
  const pad = Math.round(
    2 * (element.data?.["radius"] ?? 1) * scaleRef.current
  );

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

    ctx.restore();
    ctx.save();
    ctx.scale(DPIFactor, DPIFactor);
    ctx.translate(pad, pad);
    clearCanvas({ ctx });

    drawCurve({
      ctx,
      path: decompressPath(path, scaleRef.current),
      color: color ?? "black",
      radius: (radius ?? 1) * scaleRef.current,
      opacity,
    });
  }, [pad, element]);

  const w = (element.w ?? 100) + 2 * pad;
  const h = (element.h ?? 100) + 2 * pad;
  scaleRef.current = getMaxCanvasSizeScale(w * DPIFactor, h * DPIFactor);
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={scaleRef.current * w * DPIFactor}
        height={scaleRef.current * h * DPIFactor}
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
  color?: string;
  radius?: number;
  opacity?: number;
}) {
  if (path.length == 0) {
    // empty path -- nothing to draw
    return;
  }
  // There's some useful MIT licensed code at https://github.com/embiem/react-canvas-draw
  // that inspired this.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color ?? "#000";
  if (opacity) {
    ctx.globalAlpha = opacity;
  }

  ctx.lineWidth = 2 * (radius ?? 0.5);

  if (path.length <= 1) {
    const p = path[0];
    // draw a circle of the given radius at p.
    ctx.moveTo(p.x, p.y);
    ctx.beginPath();
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    return;
  }

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

// Return a single scalar so that multiplying by it transforms
// coordinates
export function getMaxCanvasSizeScale(w: number, h: number): number {
  if (w <= MAX_CANVAS_SIZE && w <= MAX_CANVAS_SIZE) {
    return 1;
  } else {
    if (w >= h) {
      return MAX_CANVAS_SIZE / w;
    } else {
      return MAX_CANVAS_SIZE / h;
    }
  }
}
