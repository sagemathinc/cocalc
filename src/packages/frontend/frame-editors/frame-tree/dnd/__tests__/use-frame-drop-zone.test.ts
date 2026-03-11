import { computeDropZone } from "../use-frame-drop-zone";

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
