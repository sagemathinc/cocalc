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

export function getPageSpan(elements: Element[]): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  let xMin = 0,
    yMin = 0,
    xMax = 0,
    yMax = 0;
  for (const element of elements) {
    const x = element.x ?? 0;
    const y = element.y ?? 0;
    const w = element.w ?? 0;
    const h = element.h ?? 0;
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x + w > xMax) xMax = x + w;
    if (y + h > yMax) yMax = y + h;
  }
  return { xMin, xMax, yMin, yMax };
}
