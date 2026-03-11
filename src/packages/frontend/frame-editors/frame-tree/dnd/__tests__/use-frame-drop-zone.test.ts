jest.mock(
  "@cocalc/frontend/components/dnd",
  () => ({
    MOUSE_SENSOR_OPTIONS: {},
    TOUCH_SENSOR_OPTIONS: {},
    DRAG_OVERLAY_MODIFIERS: [],
    DragOverlayContent: () => null,
  }),
  { virtual: true },
);

import { computeDropZone } from "../use-frame-drop-zone";
import { shouldExtractTabFromDrop } from "../frame-dnd-provider";

function makeRect({
  left = 0,
  top = 0,
  width = 200,
  height = 100,
}: Partial<DOMRect> = {}): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("computeDropZone", () => {
  it("returns tab when the pointer is inside the title bar strip", () => {
    const rect = makeRect();
    expect(computeDropZone(rect, 100, 10, 24)).toBe("tab");
  });

  it("returns center when the pointer is in the interior", () => {
    const rect = makeRect();
    expect(computeDropZone(rect, 100, 50, 0)).toBe("center");
  });

  it("returns the expected edge zones", () => {
    const rect = makeRect();
    expect(computeDropZone(rect, 100, 5, 0)).toBe("top");
    expect(computeDropZone(rect, 100, 95, 0)).toBe("bottom");
    expect(computeDropZone(rect, 10, 50, 0)).toBe("left");
    expect(computeDropZone(rect, 190, 50, 0)).toBe("right");
  });

  it("resolves corners by nearest edge", () => {
    const rect = makeRect();
    // Ties fall through to the horizontal edge because the implementation
    // uses strict < comparisons in the corner cases.
    expect(computeDropZone(rect, 10, 5, 0)).toBe("left");
    expect(computeDropZone(rect, 5, 10, 0)).toBe("left");
    expect(computeDropZone(rect, 188, 4, 0)).toBe("top");
    expect(computeDropZone(rect, 192, 20, 0)).toBe("right");
  });
});

describe("shouldExtractTabFromDrop", () => {
  it("extracts when dragging a tab to an edge inside its own tab container", () => {
    expect(
      shouldExtractTabFromDrop("a", "left", {
        tabContainerId: "tabs1",
        tabChildIds: ["a", "b", "c"],
      }),
    ).toBe(true);
  });

  it("does not extract for non-edge zones", () => {
    expect(
      shouldExtractTabFromDrop("a", "center", {
        tabContainerId: "tabs1",
        tabChildIds: ["a", "b", "c"],
      }),
    ).toBe(false);
    expect(
      shouldExtractTabFromDrop("a", "tab", {
        tabContainerId: "tabs1",
        tabChildIds: ["a", "b", "c"],
      }),
    ).toBe(false);
  });

  it("does not extract when dragging an external frame over a tab container edge", () => {
    expect(
      shouldExtractTabFromDrop("external", "right", {
        tabContainerId: "tabs1",
        tabChildIds: ["a", "b", "c"],
      }),
    ).toBe(false);
  });
});
