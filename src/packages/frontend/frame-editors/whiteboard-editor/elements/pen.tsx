/*
There's some useful MIT licensed code at https://github.com/embiem/react-canvas-draw
that inspired this.
*/

import { useEffect, useRef } from "react";
import type { Element } from "../types";

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
    const points = element.data?.["path"];
    if (points == null) return;
    drawCurve({ ctx, points, brushColor: "black", brushRadius: 1 });
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

function drawCurve({
  ctx,
  points,
  brushColor,
  brushRadius,
}: {
  ctx;
  points: number[];
  brushColor: string;
  brushRadius: number;
}) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = brushColor;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineWidth = brushRadius * 2;

  let p1 = points[0];
  let p2 = points[1];

  ctx.moveTo(p2[0], p2[1]);
  ctx.beginPath();

  for (let i = 1, len = points.length; i < len; i++) {
    // we pick the point between pi+1 & pi+2 as the
    // end point and p1 as our control point
    ctx.quadraticCurveTo(
      p1[0],
      p1[1],
      (p1[0] + p2[0]) / 2,
      (p1[1] + p2[1]) / 2
    );
    p1 = points[i];
    p2 = points[i + 1];
  }
  // Draw last line as a straight line.
  ctx.lineTo(p1[0], p1[1]);
  ctx.stroke();
}
