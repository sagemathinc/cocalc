/*
There's some useful MIT licensed code at https://github.com/embiem/react-canvas-draw
that inspired this.
*/

import { useEffect, useRef } from "react";
import type { Element, Point } from "../types";
import { decompressPath } from "../math";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function Pen({ element }: Props) {
  const canvasRef = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const ctx = canvas.getContext("2d");
    if (ctx == null) return;
    const path = element.data?.["path"];
    if (path == null) return;
    clearCanvas({ ctx });
    drawCurve({
      ctx,
      path: decompressPath(path),
      color: "black",
      radius: 1,
    });
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={`${element.w}px`}
        height={`${element.h}px`}
      />
    </>
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
}: {
  ctx;
  path: Point[];
  color: string;
  radius: number;
}) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;

  ctx.lineWidth = radius;

  let p1 = path[0];
  let p2 = path[1];

  ctx.moveTo(p2.x, p2.y);
  ctx.beginPath();

  for (let i = 1, len = path.length; i < len; i++) {
    // we pick the point between pi+1 & pi+2 as the
    // end point and p1 as our control point
    ctx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
    p1 = path[i];
    p2 = path[i + 1];
  }
  // Draw last line as a straight line.
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}
