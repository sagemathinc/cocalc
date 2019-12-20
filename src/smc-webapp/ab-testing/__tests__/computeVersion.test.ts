import { computeVersion } from "../compute-version";

describe("computeVersion", () => {
  test("Returns A or B", () => {
    expect(computeVersion("0")).toBe("B");
    expect(computeVersion("1")).toBe("B");
    expect(computeVersion("2")).toBe("B");
    expect(computeVersion("3")).toBe("B");
    expect(computeVersion("4")).toBe("B");
    expect(computeVersion("5")).toBe("B");
    expect(computeVersion("6")).toBe("B");
    expect(computeVersion("7")).toBe("B");
    expect(computeVersion("8")).toBe("A");
    expect(computeVersion("9")).toBe("A");
    expect(computeVersion("a")).toBe("A");
    expect(computeVersion("b")).toBe("A");
    expect(computeVersion("c")).toBe("A");
    expect(computeVersion("d")).toBe("A");
    expect(computeVersion("e")).toBe("A");
    expect(computeVersion("f")).toBe("A");
  });

  test("Returns A when undefined", () => {
    expect(computeVersion()).toBe("A");
  });

  test("Returns A when empty", () => {
    expect(computeVersion()).toBe("A");
  });
});
