/*
Misc little bits of math.

It seems like some basic trig, etc., is useful for this sort of editor!

*/

import { Element, Placement, Point, Rect } from "./types";
import { cmp } from "@cocalc/util/misc";

// We just declare a font size of 14 to be "zoom 100%".

import { DEFAULT_FONT_SIZE } from "./tools/defaults";
export function fontSizeToZoom(size?: number): number {
  return size ? size / DEFAULT_FONT_SIZE : 1;
}
export function zoomToFontSize(zoom?: number): number {
  return zoom ? zoom * DEFAULT_FONT_SIZE : DEFAULT_FONT_SIZE;
}

export const DEFAULT_WIDTH = 350;
export const DEFAULT_HEIGHT = 100;
export const DEFAULT_GAP = 30;
export const DEFAULT_EDGE_LENGTH = 100;

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
  // NOTE: we exclude elements with w=0 or h=0, since they take up no space.

  let xMin, xMax, yMin, yMax, zMin, zMax;
  let init = false;
  for (const element of elements) {
    if (element.w == 0 || element.h == 0) continue;
    if (!init) {
      init = true;
      xMin = element.x ?? 0;
      xMax = element.x ?? 0;
      yMin = element.y ?? 0;
      yMax = element.y ?? 0;
      zMin = element.z ?? 0;
      zMax = element.z ?? 0;
    }
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
  if (!init) {
    xMin = xMax = yMin = yMax = zMin = zMax = 0;
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

// Motivation: edges are represented as rectangles of h=w=0 at position x=y=0,
// and this function removes those from consideration.
export function removeTrivial(rects: Rect[]): Rect[] {
  return rects.filter((rect) => rect.w != 0 || rect.h != 0);
}

// Get the rectangle spanned by given rectangles.
// Simpler version of getPageSpan above...
export function rectSpan(rects: Rect[]): Rect {
  rects = removeTrivial(rects);
  if (rects.length == 0) {
    return { x: 0, y: 0, w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
  }
  let { x: xMin, y: yMin, w, h } = rects[0];
  let xMax = xMin + w,
    yMax = yMin + h;
  for (const { x, y, w, h } of rects.slice(1)) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x + w > xMax) xMax = x + w;
    if (y + h > yMax) yMax = y + h;
  }
  return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
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

export function rectEqual(rect1?: Rect, rect2?: Rect): boolean {
  return (
    rect1?.x === rect2?.x &&
    rect1?.y === rect2?.y &&
    rect1?.w === rect2?.w &&
    rect1?.h === rect2?.h
  );
}

export function compressPath(path: Point[]): number[] {
  const v: number[] = [];
  for (const p of path) {
    v.push(p.x, p.y);
  }
  return v;
}

export function decompressPath(compressedPath: number[], scale = 1): Point[] {
  const path: Point[] = [];
  if (scale == 1) {
    // just in case the JIT is dumb?
    for (let i = 0; i < compressedPath.length; i += 2) {
      path.push({ x: compressedPath[i], y: compressedPath[i + 1] });
    }
  } else {
    for (let i = 0; i < compressedPath.length; i += 2) {
      path.push({
        x: compressedPath[i] * scale,
        y: compressedPath[i + 1] * scale,
      });
    }
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

// Point right between two points.
export function midPoint(p0: Point, p1: Point): Point {
  return { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
}

// Compute data to define an edge drawn from one rectangle to another

export function drawEdge(
  r0: Rect,
  r1: Rect
): {
  rect: Rect; // rectangle that contains the edge path
  path: Point[]; // path drawn using coordinates inside the rect.
  dir: Point[]; // path indicating direction of edge.
} {
  const c0 = centerOfRect(r0);
  const c1 = centerOfRect(r1);
  const x = Math.min(c0.x, c1.x);
  const y = Math.min(c0.y, c1.y);
  const w = Math.max(c0.x, c1.x) - x + 1;
  const h = Math.max(c0.y, c1.y) - y + 1;

  const path = [
    { x: c0.x - x, y: c0.y - y },
    { x: c1.x - x, y: c1.y - y },
  ];

  // draw path to indicate direction of the edge
  const c = midPoint(path[0], path[1]);
  const dir = [
    { x: c.x - 10, y: c.y - 10 },
    c,
    c,
    { x: c.x - 10, y: c.y + 10 },
  ];
  return { rect: { x, y, w, h }, path, dir };
}

// Translate the list of rectangles (by mutating them!)
// so that the center of the rectangle they together span
// is the given center.
export function centerRectsAt(rects: Rect[], center: Point): void {
  const cur = centerOfRect(rectSpan(rects));
  const x = center.x - cur.x;
  const y = center.y - cur.y;
  for (const rect of rects) {
    rect.x += x;
    rect.y += y;
  }
}

// translate all the input objects of the rects by a single number
// so their zMin is as given.  MUTATES!
export function translateRectsZ(objs: { z?: number }[], zMin: number): void {
  if (objs.length == 0) return;
  let cur = objs[0].z ?? 0;
  for (const obj of objs.slice(1)) {
    if (obj.z != null && obj.z < cur) {
      cur = obj.z;
    }
  }
  const t = zMin - cur;
  if (t) {
    for (const obj of objs) {
      obj.z = (obj.z ?? 0) + t;
    }
  }
}

export function getGroup(elements: Element[], group?: string): Element[] {
  const X: Element[] = [];
  if (!group) return X;
  for (const element of elements) {
    if (element?.group == group) {
      X.push(element);
    }
  }
  return X;
}

// compute a scale and translation, so if you first scale rect1, then translate,
// you end up inside rect2.  Obviously, not possible in degenerate cases when
// both don't have positive w and h...
export function fitRectToRect(
  rect1: Rect,
  rect2: Rect
): { scale: number; translate: Point } {
  const scale_x = rect2.w / rect1.w;
  const scale_y = rect2.h / rect1.h;
  // choose the scale that also works for the other direction.
  let scale: number;
  if (scale_x * rect1.h <= rect2.h) {
    scale = scale_x;
  } else if (scale_y * rect1.w <= rect2.w) {
    scale = scale_y;
  } else {
    // just choose one -- better than crashing.
    scale = scale_x;
  }
  return {
    scale,
    translate: { x: rect2.x - rect1.x, y: rect2.y - rect1.y },
  };
}

export interface Transforms {
  dataToWindowNoScale: (
    // name includes "NoScale" just to emphasize this doesn't involve scaling.  It's just translating around.
    x: number,
    y: number,
    z?: number
  ) => { x: number; y: number; z: number };
  windowToDataNoScale: (x: number, y: number) => { x: number; y: number };
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  zMap: { [z: number]: number };
}

export function getTransforms(elements, margin: number = 0): Transforms {
  /*
  Consider the x and y coordinates of all elements, which could be anywhere in the "infinite canvas",
  Then transform to a rectangle (0,0) --> (width,height), along with a margin.
  Returns functions to transform back and forth.

  We also map the zIndex z values of object to be 1,2,..., MAX_ELEMENTS,
  so we can confidently place UI elements, etc. above MAX_ELEMENTS.

  This doesn't do anything related to scaling.
  */

  let { xMin, yMin, xMax, yMax, zMin, zMax } = getPageSpan(elements, margin);
  const zMap = zIndexMap(elements);

  function dataToWindowNoScale(x, y, z?) {
    return {
      x: (x ?? 0) - xMin,
      y: (y ?? 0) - yMin,
      z: zMap[z ?? 0] ?? 0,
    };
  }
  function windowToDataNoScale(x, y) {
    return {
      x: (x ?? 0) + xMin,
      y: (y ?? 0) + yMin,
    };
  }
  return {
    dataToWindowNoScale,
    windowToDataNoScale,
    width: xMax - xMin,
    height: yMax - yMin,
    xMin,
    yMin,
    xMax,
    yMax,
    zMin,
    zMax,
    zMap,
  };
}

// this sorts elements by their z value as a side effect.
// TODO: potentially inefficient, since we do this every time anything changes...
function zIndexMap(elements: Element[]) {
  elements.sort((x, y) => cmp(x.z ?? 0, y.z ?? 0));
  const zMap: { [z: number]: number } = {};
  let i = 1;
  for (const { z } of elements) {
    zMap[z ?? 0] = i;
    i += 1;
  }
  return zMap;
}

// round any parameters of rectangle to nearest integers, mutating the rectangle.
export function roundRectParams(rect: Partial<Rect>) {
  if (rect.x !== undefined) rect.x = Math.round(rect.x);
  if (rect.y !== undefined) rect.y = Math.round(rect.y);
  if (rect.w !== undefined) rect.w = Math.round(rect.w);
  if (rect.h !== undefined) rect.h = Math.round(rect.h);
}

// mutate rect moving it to be adjacent to where it is...
export function moveRectAdjacent(
  rect: Rect,
  placement: Placement = "bottom",
  gap = DEFAULT_EDGE_LENGTH
) {
  const p: string = placement.toLowerCase();
  if (p.includes("bottom")) {
    rect.y += rect.h + gap;
  }
  if (p.includes("top")) {
    rect.y -= rect.h + gap;
  }
  if (p.includes("right")) {
    rect.x += rect.w + gap;
  }
  if (p.includes("left")) {
    rect.x -= rect.w + gap;
  }
}

// mutate rect so that it doesn't intersect anything in rects. Do this
// by moving it along the x or y axis.
export function moveUntilNotIntersectingAnything(
  rect: Rect,
  rects: Rect[],
  axis: "x" | "y",
  dir: "+" | "-" | "best" = "best"
): void {
  if (!rect.w || !rect.h || rect.x == null || rect.y == null) {
    // would infinite loop below otherwise... and there is nothing good to do,
    // so just give up.
    // None of the above should happen, but bad data shouldn't lead to infinite loop.
    return;
  }
  if (dir == "best") {
    const start = { x: rect.x, y: rect.y };
    moveUntilNotIntersectingAnything(rect, rects, axis, "+");
    const up = { x: rect.x, y: rect.y };
    rect.x = start.x;
    rect.y = start.y;
    moveUntilNotIntersectingAnything(rect, rects, axis, "-");
    const down = { x: rect.x, y: rect.y };
    // which is better?
    if (distancePoints(start, up) < distancePoints(start, down)) {
      rect.x = up.x;
      rect.y = up.y;
    } else {
      rect.x = down.x;
      rect.y = down.y;
    }
    return;
  }
  let cnt = 0;
  while (cnt < 1000) { // no matter what, we aren't going to infinite loop!
    cnt += 1;
    const before = { x: rect.x, y: rect.y };
    for (const r of rects) {
      const { w, h } = intersectionOfRectangles(rect, r);
      if (w > 0 && h > 0) {
        // the rectangles overlap.
        if (dir == "+") {
          if (axis == "x") {
            rect.x = rect.x + w + DEFAULT_GAP;
          } else if (axis == "y") {
            rect.y = rect.y + h + DEFAULT_GAP;
          }
        } else {
          if (axis == "x") {
            rect.x = rect.x - (w + DEFAULT_GAP);
          } else if (axis == "y") {
            rect.y = rect.y - (h + DEFAULT_GAP);
          }
        }
        break;
      }
    }
    if (pointEqual(before, rect)) {
      // rect didn't move at all.
      return;
    }
  }
}

export function distancePoints(p1: Point, p2: Point): number {
  const a = p1.x - p2.x;
  const b = p1.y - p2.y;
  return Math.sqrt(a * a + b * b);
}

// keys of output match Position from types and antd...
export function cornersOfRect(rect: Rect): {
  leftTop: Point;
  rightTop: Point;
  leftBottom: Point;
  rightBottom: Point;
} {
  return {
    leftTop: { x: rect.x, y: rect.y },
    rightTop: { x: rect.x + rect.w, y: rect.y },
    leftBottom: { x: rect.x, y: rect.y + rect.h },
    rightBottom: { x: rect.x + rect.w, y: rect.y + rect.h },
  };
}

export function midpointsOfRect(rect: Rect): {
  top: Point;
  bottom: Point;
  left: Point;
  right: Point;
} {
  return {
    top: { x: rect.x + rect.w / 2, y: rect.y },
    bottom: { x: rect.x + rect.w / 2, y: rect.y + rect.h },
    left: { x: rect.x, y: rect.y + rect.h / 2 },
    right: { x: rect.x + rect.w, y: rect.y + rect.h / 2 },
  };
}

export function distanceToMidpoints(p: Point, rect: Rect): number {
  let min: undefined | number = undefined;
  for (const [, q] of Object.entries(midpointsOfRect(rect))) {
    const d = distancePoints(p, q);
    if (min === undefined) {
      min = d;
    } else {
      min = Math.min(d, min);
    }
  }
  if (min == undefined) throw Error("bug");
  return min;
}

// Returns the midpoint of a side of rect1 that is closest to rect2.
export function closestMidpoint(rect1: Rect, rect2: Rect): Point {
  let closestPoint: Point | undefined = undefined;
  let closestDistance: number | undefined = undefined;
  for (const [, point] of Object.entries(midpointsOfRect(rect1))) {
    const d = distanceToMidpoints(point, rect2);
    if (closestPoint === undefined || closestDistance === undefined) {
      closestPoint = point;
      closestDistance = d;
    } else if (d < closestDistance) {
      closestDistance = d;
      closestPoint = point;
    }
  }
  if (closestPoint === undefined) throw Error("impossible bug");
  return closestPoint;
}
