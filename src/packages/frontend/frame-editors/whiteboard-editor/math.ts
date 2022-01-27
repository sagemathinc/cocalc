/*
Misc little bits of math.

It seems like some basic trig, etc., is useful for this sort of editor!

*/

import { Element } from "./types";

interface Point {
  x: number;
  y: number;
}

// We just declare a font size of 14 to be "zoom 100%".

export const ZOOM100 = 14;
export function fontSizeToZoom(size?: number): number {
  return size ? size / ZOOM100 : 1;
}

export const DEFAULT_WIDTH = 300;
export const DEFAULT_HEIGHT = 200;

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
  let xMin = 0,
    yMin = 0,
    xMax = 0,
    yMax = 0,
    zMin = 0,
    zMax = 0;
  for (const element of elements) {
    const x = element.x ?? 0;
    const y = element.y ?? 0;
    const z = element.z ?? 0;
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
