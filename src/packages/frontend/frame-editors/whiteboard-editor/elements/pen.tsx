/*
I emplemented both a canvas and svg approach.  So far I like the canvas with dpi factor best.
*/

import { useEffect, useRef } from "react";
import type { Element, Point } from "../types";
import { decompressPath, decompressPathPairs } from "../math";
import { SVG } from "@svgdotjs/svg.js";
import svgBezierPath from "./svg-bezier-path";

interface Props {
  element: Element;
  focused?: boolean;
}

const CANVAS = true;
const DPIFactor = 4;

export default function Pen({ element }: Props) {
  const canvasRef = useRef<any>(null);
  const svgRef = useRef<any>(null);
  const svgDraw = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const ctx = canvas.getContext("2d");
    if (ctx == null) return;
    ctx.scale(DPIFactor, DPIFactor);
  }, []);

  useEffect(() => {
    if (!CANVAS) return;
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const ctx = canvas.getContext("2d");
    if (ctx == null) return;
    const data:
      | { path?: number[]; color?: string; width?: number }
      | undefined = element.data;
    if (data == null) return;
    const path = data.path;
    if (path == null) return;
    clearCanvas({ ctx });
    drawCurve({
      ctx,
      path: decompressPath(path),
      color: "black",
      radius: 1,
    });
  }, [element]);

  useEffect(() => {
    if (CANVAS) return;
    const c = svgRef.current;
    if (!c) return;
    svgDraw.current = SVG().addTo(svgRef.current).size(element.w, element.h);
  }, []);

  useEffect(() => {
    if (CANVAS) return;
    const draw = svgDraw.current;
    if (!draw) return;
    const data:
      | { path?: number[]; color?: string; width?: number }
      | undefined = element.data;
    if (data == null) return;
    const path = data.path;
    if (path == null || path.length <= 1) return;
    draw.clear();
    const p = draw.path(svgBezierPath(decompressPathPairs(path)));
    p.fill("none");
    p.stroke({
      color: data.color ?? "black",
      width: data.width ?? 1,
      linecap: "round",
      linejoin: "round",
    });
  }, [element]);

  const w = element.w ?? 100;
  const h = element.h ?? 100;
  return (
    <div>
      {CANVAS && (
        <canvas
          ref={canvasRef}
          width={w * DPIFactor}
          height={h * DPIFactor}
          style={{
            width: `${w}px`,
            height: `${h}px`,
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      )}
      {!CANVAS && (
        <svg
          ref={svgRef}
          width={`${w}px`}
          height={`${h}px`}
          style={{ position: "absolute", top: 0, left: 0 }}
        />
      )}
      {/* JSON.stringify(decompressPath(element.data.path)) */}
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
}: {
  ctx;
  path: Point[];
  color: string;
  radius: number;
}) {
  // There's some useful MIT licensed code at https://github.com/embiem/react-canvas-draw
  // that inspired this.
  if (path.length <= 1) return;
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
