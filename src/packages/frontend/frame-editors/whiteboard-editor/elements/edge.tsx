/*
Render an edge from one node to another.
*/

import type { Element, ElementsMap, Point, Rect } from "../types";
import Arrow from "./arrow";
import { closestMidpoint, getPosition, Transforms } from "../math";
import { SELECTED_BORDER_COLOR, SELECTED_BORDER_WIDTH } from "./style";

interface Props {
  element: Element;
  elementsMap: ElementsMap;
  transforms: Transforms;
  cursors?: { [account_id: string]: any[] };
  selected?: boolean;
  previewMode?: boolean;
  onClick?: (any) => void;
  zIndex?: number; // override element.z
}

export default function Edge({
  element,
  elementsMap,
  transforms,
  cursors,
  selected,
  previewMode,
  onClick,
  zIndex,
}: Props) {
  cursors = cursors; // Not using *yet*.

  const endpoints = getEndpoints(element, elementsMap, transforms, zIndex);
  if (endpoints == null) {
    return null;
  }
  const { start, end } = endpoints;

  const thickness = (element.data?.radius ?? 0.5) * 2;

  return (
    <Arrow
      start={start}
      end={end}
      arrowSize={thickness * 5 + 14}
      thickness={thickness}
      color={previewMode ? "#9fc3ff" : element.data?.color}
      opacity={element.data?.opacity}
      style={{
        zIndex: endpoints.zIndex,
        border: `${SELECTED_BORDER_WIDTH}px solid ${
          selected ? SELECTED_BORDER_COLOR : "transparent"
        }`,
        background: previewMode ? "#9fc3ff" : undefined,
        ...(onClick != null
          ? { padding: "2.5px 10px", marginTop: "-5px", cursor: "pointer" }
          : { padding: "0 10px" }),
      }}
      onClick={onClick}
      preview={element.data?.previewTo != null}
    />
  );
}

function toWindowRectNoScale(transforms, element): Rect {
  const { x, y, z, w, h } = getPosition(element);
  return { ...transforms.dataToWindowNoScale(x, y, z), w, h };
}

function getEndpoints(
  element,
  elementsMap,
  transforms,
  zIndex
): { start: Point; end: Point; zIndex: number } | null {
  const { from: fromId } = element.data ?? {};
  if (fromId == null) return null; // invalid data
  const fromElt = elementsMap.get(fromId)?.toJS();
  if (fromElt == null || fromElt.hide != null) {
    // TODO: maybe delete edge -- it is no longer valid?
    return null;
  }

  // We use a heuristic about where to draw the edge.
  // Basically, we want it to go between the middles of
  // the closest edges.   TODO: Sometimes a longer path that avoids
  // overlapping exists... or maybe curve the line?
  const from = toWindowRectNoScale(transforms, fromElt);
  if (zIndex == null) {
    zIndex = transforms.zMap[element.z ?? 0] ?? 0;
  }

  let end: Point;
  let to: Rect;
  if (element.data?.previewTo != null) {
    const { x, y } = element.data?.previewTo;
    end = transforms.dataToWindowNoScale(x, y, zIndex);
    to = { ...end, w: 1, h: 1 };
  } else {
    const { to: toId } = element.data ?? {};
    if (toId == null) return null; // invalid data
    const toElt = elementsMap.get(toId)?.toJS();
    if (toElt == null || toElt.hide != null) {
      return null;
    }
    to = toWindowRectNoScale(transforms, toElt);
    end = closestMidpoint(to, from);
  }
  const start = closestMidpoint(from, to);

  return { start, end, zIndex };
}
