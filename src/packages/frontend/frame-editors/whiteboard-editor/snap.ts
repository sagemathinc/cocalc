/*
 *  This file is part of CoCalc: Copyright © 2025-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Snap/alignment logic for whiteboard and slides elements.

Computes snap targets from:
- Page/slide borders (edges and center axes)
- Other elements on the same page (edges and center axes)

Returns adjusted positions and guide lines to render.
*/

import { Element, Rect } from "./types";
import { getPosition } from "./math";
import { GRID_MAJOR, GRID_MINOR } from "./elements/grid";

// Distance threshold in data coordinates within which snapping activates
const SNAP_THRESHOLD = 8;

export interface SnapLine {
  // A horizontal or vertical guide line to render
  orientation: "horizontal" | "vertical";
  // The fixed coordinate (y for horizontal, x for vertical)
  position: number;
  // Range to draw the line across
  start: number;
  end: number;
}

export interface SnapResult {
  // Adjusted offset (how much to shift from the raw drag offset)
  dx: number;
  dy: number;
  // Guide lines to display
  lines: SnapLine[];
}

interface SnapTarget {
  orientation: "horizontal" | "vertical";
  position: number; // the coordinate value to snap to
}

// Given a dragged element's current rect (after applying raw offset),
// compute snap adjustments and guide lines.
export function computeSnap({
  movingRect,
  otherElements,
  pageRect,
  canvasScale,
}: {
  movingRect: Rect;
  otherElements: Element[];
  pageRect?: Rect; // the slide/page boundary, if any
  canvasScale?: number; // current zoom level; used for grid snapping
}): SnapResult {
  const targets = collectSnapTargets(otherElements, pageRect);

  // Add grid snap targets around the moving element's neighborhood.
  // Major grid lines (100px) always; minor (20px) only when zoomed in past 200%.
  const gridStep =
    canvasScale != null && canvasScale >= 2 ? GRID_MINOR : GRID_MAJOR;
  if (canvasScale != null) {
    addGridTargets(targets, movingRect, gridStep);
  }

  // Edges and center of the moving element
  const movingLeft = movingRect.x;
  const movingRight = movingRect.x + movingRect.w;
  const movingCenterX = movingRect.x + movingRect.w / 2;
  const movingTop = movingRect.y;
  const movingBottom = movingRect.y + movingRect.h;
  const movingCenterY = movingRect.y + movingRect.h / 2;

  const movingXPoints = [movingLeft, movingCenterX, movingRight];
  const movingYPoints = [movingTop, movingCenterY, movingBottom];

  let bestDx = Infinity;
  let bestDy = Infinity;
  const matchedVertical: { target: number; movingVal: number }[] = [];
  const matchedHorizontal: { target: number; movingVal: number }[] = [];

  for (const target of targets) {
    if (target.orientation === "vertical") {
      for (const mx of movingXPoints) {
        const dist = Math.abs(mx - target.position);
        if (dist < SNAP_THRESHOLD) {
          if (dist < Math.abs(bestDx)) {
            bestDx = target.position - mx;
            matchedVertical.length = 0;
            matchedVertical.push({
              target: target.position,
              movingVal: mx,
            });
          } else if (Math.abs(dist - Math.abs(bestDx)) < 0.5) {
            matchedVertical.push({
              target: target.position,
              movingVal: mx,
            });
          }
        }
      }
    } else {
      for (const my of movingYPoints) {
        const dist = Math.abs(my - target.position);
        if (dist < SNAP_THRESHOLD) {
          if (dist < Math.abs(bestDy)) {
            bestDy = target.position - my;
            matchedHorizontal.length = 0;
            matchedHorizontal.push({
              target: target.position,
              movingVal: my,
            });
          } else if (Math.abs(dist - Math.abs(bestDy)) < 0.5) {
            matchedHorizontal.push({
              target: target.position,
              movingVal: my,
            });
          }
        }
      }
    }
  }

  const dx = Math.abs(bestDx) < SNAP_THRESHOLD ? bestDx : 0;
  const dy = Math.abs(bestDy) < SNAP_THRESHOLD ? bestDy : 0;

  // Build guide lines
  const lines: SnapLine[] = [];

  // Compute the snapped rect for determining guide line extent
  const snappedRect = {
    x: movingRect.x + dx,
    y: movingRect.y + dy,
    w: movingRect.w,
    h: movingRect.h,
  };

  if (dx !== 0) {
    for (const m of matchedVertical) {
      const x = m.target;
      // Extend the vertical guide line to cover the moving element
      // and any elements that share this alignment
      const { start, end } = getVerticalLineExtent(
        x,
        snappedRect,
        otherElements,
        pageRect,
      );
      lines.push({
        orientation: "vertical",
        position: x,
        start,
        end,
      });
    }
  }

  if (dy !== 0) {
    for (const m of matchedHorizontal) {
      const y = m.target;
      const { start, end } = getHorizontalLineExtent(
        y,
        snappedRect,
        otherElements,
        pageRect,
      );
      lines.push({
        orientation: "horizontal",
        position: y,
        start,
        end,
      });
    }
  }

  return { dx, dy, lines };
}

function collectSnapTargets(
  elements: Element[],
  pageRect?: Rect,
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  // Page/slide border targets
  if (pageRect) {
    const px = pageRect.x;
    const py = pageRect.y;
    const pw = pageRect.w;
    const ph = pageRect.h;

    // Edges
    targets.push({ orientation: "vertical", position: px });
    targets.push({ orientation: "vertical", position: px + pw });
    targets.push({ orientation: "horizontal", position: py });
    targets.push({ orientation: "horizontal", position: py + ph });

    // Center axes
    targets.push({ orientation: "vertical", position: px + pw / 2 });
    targets.push({ orientation: "horizontal", position: py + ph / 2 });
  }

  // Element targets
  for (const el of elements) {
    if (!isFinite(el.z)) continue; // skip slide base layers
    if (el.type === "edge") continue; // edges don't have meaningful bounds
    const pos = getPosition(el);

    // Left, center, right
    targets.push({ orientation: "vertical", position: pos.x });
    targets.push({ orientation: "vertical", position: pos.x + pos.w / 2 });
    targets.push({ orientation: "vertical", position: pos.x + pos.w });

    // Top, center, bottom
    targets.push({ orientation: "horizontal", position: pos.y });
    targets.push({ orientation: "horizontal", position: pos.y + pos.h / 2 });
    targets.push({ orientation: "horizontal", position: pos.y + pos.h });
  }

  return targets;
}

// Add grid line targets near the moving element so we don't generate
// thousands of targets across the infinite canvas.
function addGridTargets(
  targets: SnapTarget[],
  movingRect: Rect,
  step: number,
): void {
  const margin = step * 2; // look a couple of grid cells in each direction
  const xStart = Math.floor((movingRect.x - margin) / step) * step;
  const xEnd = Math.ceil((movingRect.x + movingRect.w + margin) / step) * step;
  const yStart = Math.floor((movingRect.y - margin) / step) * step;
  const yEnd = Math.ceil((movingRect.y + movingRect.h + margin) / step) * step;
  for (let x = xStart; x <= xEnd; x += step) {
    targets.push({ orientation: "vertical", position: x });
  }
  for (let y = yStart; y <= yEnd; y += step) {
    targets.push({ orientation: "horizontal", position: y });
  }
}

function getVerticalLineExtent(
  x: number,
  snappedRect: Rect,
  otherElements: Element[],
  pageRect?: Rect,
): { start: number; end: number } {
  let start = snappedRect.y;
  let end = snappedRect.y + snappedRect.h;

  for (const el of otherElements) {
    if (!isFinite(el.z) || el.type === "edge") continue;
    const pos = getPosition(el);
    const elLeft = pos.x;
    const elCenter = pos.x + pos.w / 2;
    const elRight = pos.x + pos.w;
    if (
      Math.abs(elLeft - x) < 1 ||
      Math.abs(elCenter - x) < 1 ||
      Math.abs(elRight - x) < 1
    ) {
      start = Math.min(start, pos.y);
      end = Math.max(end, pos.y + pos.h);
    }
  }

  if (pageRect) {
    const px = pageRect.x;
    const pcx = pageRect.x + pageRect.w / 2;
    const prx = pageRect.x + pageRect.w;
    if (
      Math.abs(px - x) < 1 ||
      Math.abs(pcx - x) < 1 ||
      Math.abs(prx - x) < 1
    ) {
      start = Math.min(start, pageRect.y);
      end = Math.max(end, pageRect.y + pageRect.h);
    }
  }

  return { start, end };
}

function getHorizontalLineExtent(
  y: number,
  snappedRect: Rect,
  otherElements: Element[],
  pageRect?: Rect,
): { start: number; end: number } {
  let start = snappedRect.x;
  let end = snappedRect.x + snappedRect.w;

  for (const el of otherElements) {
    if (!isFinite(el.z) || el.type === "edge") continue;
    const pos = getPosition(el);
    const elTop = pos.y;
    const elCenter = pos.y + pos.h / 2;
    const elBottom = pos.y + pos.h;
    if (
      Math.abs(elTop - y) < 1 ||
      Math.abs(elCenter - y) < 1 ||
      Math.abs(elBottom - y) < 1
    ) {
      start = Math.min(start, pos.x);
      end = Math.max(end, pos.x + pos.w);
    }
  }

  if (pageRect) {
    const py = pageRect.y;
    const pcy = pageRect.y + pageRect.h / 2;
    const pby = pageRect.y + pageRect.h;
    if (
      Math.abs(py - y) < 1 ||
      Math.abs(pcy - y) < 1 ||
      Math.abs(pby - y) < 1
    ) {
      start = Math.min(start, pageRect.x);
      end = Math.max(end, pageRect.x + pageRect.w);
    }
  }

  return { start, end };
}

// Get the page/slide rect from elements (the base layer element with z=-Infinity)
export function getPageRect(elements: Element[]): Rect | undefined {
  for (const el of elements) {
    if (el.z === -Infinity && (el.type === "slide" || el.type === "page")) {
      const pos = getPosition(el);
      return { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
    }
  }
  return undefined;
}
