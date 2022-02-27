/*
Render an edge from one node to another.
*/

import type { Element, Rect } from "../types";

interface Props {
  element: Element;
  from: Rect;
  to: Rect;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  cursors?: { [account_id: string]: any[] };
}

export default function Edge({
  element,
  from,
  to,
  focused,
  canvasScale,
  readOnly,
  cursors,
}: Props) {
  console.log("edge", {
    element,
    from,
    to,
    focused,
    canvasScale,
    readOnly,
    cursors,
  });
  return (
    <div style={{ position: "absolute", left: from.x, top: from.y }}>
      <pre>{JSON.stringify(element, undefined, 2)}</pre>
    </div>
  );
}
