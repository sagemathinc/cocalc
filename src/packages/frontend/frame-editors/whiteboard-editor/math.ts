/*
Misc little bits of math.

It seems like some basic trig, etc., is useful for this sort of editor!

*/

interface Point {
  x: number;
  y: number;
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
