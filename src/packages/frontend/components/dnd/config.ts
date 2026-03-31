// Shared DnD configuration constants for @dnd-kit.
// Used by both file explorer DnD and frame editor DnD to ensure
// identical activation behavior and visual appearance.

import type { Modifier } from "@dnd-kit/core";

// --- Sensor activation constraints ---

/** Mouse: 300ms hold OR 3px drag distance to activate. */
export const MOUSE_SENSOR_OPTIONS = {
  activationConstraint: { distance: 3, delay: 300, tolerance: 5 },
} as const;

/** Touch: 300ms hold to activate. */
export const TOUCH_SENSOR_OPTIONS = {
  activationConstraint: { delay: 300, tolerance: 5 },
} as const;

// --- Overlay positioning ---

/** Extract clientX/clientY from mouse, pointer, or touch events. */
export function getEventCoords(event: Event): { x: number; y: number } | null {
  if ("clientX" in event && typeof (event as any).clientX === "number") {
    return {
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    };
  }
  const te = event as TouchEvent;
  const touch = te.touches?.[0] ?? te.changedTouches?.[0];
  if (touch) {
    return { x: touch.clientX, y: touch.clientY };
  }
  return null;
}

/**
 * Position DragOverlay at pointer (12px bottom-right offset)
 * instead of at the original element's origin.
 */
export const snapToPointerModifier: Modifier = ({
  activatorEvent,
  activeNodeRect,
  transform,
}) => {
  if (!activatorEvent || !activeNodeRect) return transform;
  const coords = getEventCoords(activatorEvent);
  if (!coords) return transform;
  return {
    ...transform,
    x: transform.x + (coords.x - activeNodeRect.left) + 12,
    y: transform.y + (coords.y - activeNodeRect.top) + 12,
  };
};

export const DRAG_OVERLAY_MODIFIERS: Modifier[] = [snapToPointerModifier];

// --- Overlay styling ---

export const DRAG_OVERLAY_STYLE = {
  padding: "4px 10px",
  borderRadius: 4,
  fontSize: "12px",
  whiteSpace: "nowrap" as const,
  width: "max-content" as const,
  pointerEvents: "none" as const,
} as const;
