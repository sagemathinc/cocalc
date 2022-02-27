/*
Render an edge from one node to another.
*/

import type { Element, Rect } from "../types";
import Arrow from "./arrow";
import { closestMidpoint } from "../math";
import { useFrameContext } from "../hooks";
import { SELECTED_BORDER_COLOR, SELECTED_BORDER_WIDTH } from "../focused";

interface Props {
  element: Element;
  from: Rect;
  to: Rect;
  canvasScale: number;
  readOnly?: boolean;
  cursors?: { [account_id: string]: any[] };
  zIndex: number;
  selected?: boolean;
  previewMode?: boolean;
}

export default function Edge({
  element,
  from,
  to,
  zIndex,
  canvasScale,
  readOnly,
  cursors,
  selected,
  previewMode,
}: Props) {
  const { actions, id: frameId } = useFrameContext();

  // Not using these *yet*.
  cursors = cursors;
  readOnly = readOnly;
  canvasScale = canvasScale;

  // We use a heuristic about where to draw the edge.
  // Basically, we want it to go between the middles of
  // the closest edges.   TODO: Sometimes a longer path that avoids
  // overlapping exists... or maybe cure the line?
  const start = closestMidpoint(from, to);
  const end = closestMidpoint(to, from);

  const thickness = (element.data?.radius ?? 0.5) * 2;

  return (
    <Arrow
      start={start}
      end={end}
      arrowSize={thickness * 5 + 14}
      thickness={thickness}
      color={previewMode ? "#9fc3ff" : element.data?.color}
      style={{
        zIndex,
        padding: "2.5px 10px",
        marginTop: "-5px",
        cursor: "pointer",
        border: `${SELECTED_BORDER_WIDTH}px solid ${
          selected ? SELECTED_BORDER_COLOR : "transparent"
        }`,
        background: previewMode ? "#9fc3ff" : undefined,
      }}
      onClick={(e) => {
        actions.setSelection(
          frameId,
          element.id,
          e.altKey || e.shiftKey || e.metaKey ? "add" : "only"
        );
      }}
    />
  );
}
