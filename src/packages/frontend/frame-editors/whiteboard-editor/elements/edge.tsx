/*
Render an edge from one node to another.
*/

import type { Element, ElementsMap, Rect } from "../types";
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
}

export default function Edge({
  element,
  elementsMap,
  transforms,
  cursors,
  selected,
  previewMode,
  onClick,
}: Props) {
  const { from: fromId, to: toId } = element.data ?? {};
  if (fromId == null || toId == null) return null; // invalid data
  const fromElt = elementsMap.get(fromId)?.toJS();
  const toElt = elementsMap.get(toId)?.toJS();
  if (
    fromElt == null ||
    toElt == null ||
    fromElt.hide != null ||
    toElt.hide != null
  ) {
    // TODO: maybe delete edge -- it is no longer valid?
    return null;
  }
  const from = toWindowRectNoScale(transforms, fromElt);
  const to = toWindowRectNoScale(transforms, toElt);
  const zIndex = transforms.zMap[element.z ?? 0] ?? 0;

  // Not using *yet*.
  cursors = cursors;

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
      opacity={element.data?.opacity}
      style={{
        zIndex,
        border: `${SELECTED_BORDER_WIDTH}px solid ${
          selected ? SELECTED_BORDER_COLOR : "transparent"
        }`,
        background: previewMode ? "#9fc3ff" : undefined,
        ...(onClick != null
          ? { padding: "2.5px 10px", marginTop: "-5px", cursor: "pointer" }
          : { padding: "0 10px" }),
      }}
      onClick={onClick}
    />
  );
}

function toWindowRectNoScale(transforms, element): Rect {
  const { x, y, z, w, h } = getPosition(element);
  return { ...transforms.dataToWindowNoScale(x, y, z), w, h };
}
