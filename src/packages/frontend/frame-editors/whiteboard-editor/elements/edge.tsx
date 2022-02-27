/*
Render an edge from one node to another.
*/

import type { Element, Rect } from "../types";
import Arrow from "./arrow";
import { closestMidpoint } from "../math";

interface Props {
  element: Element;
  from: Rect;
  to: Rect;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  cursors?: { [account_id: string]: any[] };
  zIndex: number;
}

export default function Edge({
  element,
  from,
  to,
  zIndex,
  focused,
  canvasScale,
  readOnly,
  cursors,
}: Props) {
  // Not using these *yet*.
  cursors = cursors;
  canvasScale = canvasScale;
  focused = focused;
  readOnly = readOnly;

  // We use a heuristic about where to draw the edge.
  // Basically, we want it to go between the middles of
  // the closest edges.
  const start = closestMidpoint(from, to);
  const end = closestMidpoint(to, from);

  return (
    <Arrow
      start={start}
      end={end}
      arrowSize={element.data?.fontSize}
      style={{ zIndex, padding: "0 20px" }}
    />
  );
}
