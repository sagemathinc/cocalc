/*
Misc little bits of math.

It seems like some basic trig, etc., is useful for this sort of editor!

*/

import { Element, Point, Rect } from "./types";

// We just declare a font size of 14 to be "zoom 100%".

export const ZOOM100 = 14;
export function fontSizeToZoom(size?: number): number {
  return size ? size / ZOOM100 : 1;
}

export const DEFAULT_WIDTH = 250;
export const DEFAULT_HEIGHT = 100;

// We assume that there are at most this many elements.
// E.g., to map z-indexes to integers in a safe range.
export const MAX_ELEMENTS = 1000000;

// Return angle in radians of line from pnt to origin from line
// from (0,0) to (1,0).
// This is a nonnegative number between 0 and 2*pi.
//
export function getAngle(pnt: Point): number {
  let z = Math.atan(pnt.y / pnt.x);
  if (pnt.x < 0) {
    z += Math.PI;
  }
  if (z < 0) {
    z += 2 * Math.PI;
  }
  return z;
}

export function getPosition(element: Element) {
  const { x, y, z, w, h } = element;
  return {
    x: x ?? 0,
    y: y ?? 0,
    z: z ?? 0,
    w: w ?? DEFAULT_WIDTH,
    h: h ?? DEFAULT_HEIGHT,
  };
}

export function getPageSpan(
  elements: Element[],
  margin: number = 0
): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
} {
  let xMin = elements[0]?.x ?? 0,
    xMax = elements[0]?.x ?? 0,
    yMin = elements[0]?.y ?? 0,
    yMax = elements[0]?.y ?? 0,
    zMin = elements[0]?.z ?? 0,
    zMax = elements[0]?.z ?? 0;
  for (const element of elements) {
    const x = element.x ?? xMin;
    const y = element.y ?? yMin;
    const z = element.z ?? zMin;
    const w = element.w ?? DEFAULT_WIDTH;
    const h = element.h ?? DEFAULT_HEIGHT;
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    if (x + w > xMax) xMax = x + w;
    if (y + h > yMax) yMax = y + h;
  }
  if (margin) {
    xMin -= margin;
    yMin -= margin;
    xMax += margin;
    yMax += margin;
    // do NOT add to z!
  }
  return { xMin, xMax, yMin, yMax, zMin, zMax };
}

export function pointRound({ x, y }: Point): Point {
  return { x: Math.round(x), y: Math.round(y) };
}

export function pointEqual(p1: Point, p2: Point, eps?: number): boolean {
  if (eps != null) {
    return Math.abs(p1.x - p2.x) < eps && Math.abs(p1.y - p2.y) < eps;
  }
  return p1.x == p2.x && p1.y == p2.y;
}

export function compressPath(path: Point[]): number[] {
  const v: number[] = [];
  for (const p of path) {
    v.push(p.x, p.y);
  }
  return v;
}

export function decompressPath(compressedPath: number[]): Point[] {
  const path: Point[] = [];
  for (let i = 0; i < compressedPath.length; i += 2) {
    path.push({ x: compressedPath[i], y: compressedPath[i + 1] });
  }
  return path;
}

export function decompressPathPairs(
  compressedPath: number[]
): [number, number][] {
  const path: [number, number][] = [];
  for (let i = 0; i < compressedPath.length; i += 2) {
    path.push([compressedPath[i], compressedPath[i + 1]]);
  }
  return path;
}

export function scalePath(path: Point[], scale): Point[] {
  const v: Point[] = [];
  for (const p of path) {
    v.push({ x: scale * p.x, y: scale * p.y });
  }
  return v;
}

// Returns subset of elements whose rect overlap with given rect
export function getOverlappingElements(
  elements: Element[],
  rect: Rect
): Element[] {
  return elements.filter((element) =>
    areOverlappingRectangles(eltToRect(element), rect)
  );
}

function eltToRect(element: Element): Rect {
  return {
    x: element.x,
    y: element.y,
    w: element.w ?? DEFAULT_WIDTH,
    h: element.h ?? DEFAULT_HEIGHT,
  };
}

export function pointsToRect(point1: Point, point2: Point): Rect {
  const x0 = Math.min(point1.x, point2.x);
  const x1 = Math.max(point1.x, point2.x);
  const y0 = Math.min(point1.y, point2.y);
  const y1 = Math.max(point1.y, point2.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function areOverlappingRectangles(r0: Rect, r1: Rect): boolean {
  const { w, h } = intersectionOfRectangles(r0, r1);
  return w > 0 && h > 0;
}

// Compute intersection of two rectangles.
// non-intersection ==> width of 0.
// Key idea for math below is that a rectangle is determined by
// its projection to the x and y axes.  So we just compute those
// two projections by intersecting closed intervals, then recover
// the intersection from that.
function intersectionOfRectangles(r0: Rect, r1: Rect): Rect {
  const x0 = Math.max(r0.x, r1.x);
  const x1 = Math.min(r0.x + r0.w, r1.x + r1.w);
  const y0 = Math.max(r0.y, r1.y);
  const y1 = Math.min(r0.y + r0.h, r1.y + r1.h);
  const w = Math.max(x1 - x0, 0);
  const h = Math.max(y1 - y0, 0);
  return { x: x0, y: y0, w, h };
}

export function centerOfRect(r: Rect): Point {
  return {
    x: (r.x ?? 0) + (r.w ?? DEFAULT_WIDTH) / 2,
    y: (r.y ?? 0) + (r.h ?? DEFAULT_HEIGHT) / 2,
  };
}
