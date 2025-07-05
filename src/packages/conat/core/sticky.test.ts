import { consistentHashingChoice } from "./sticky";

describe("tests of consistentHashingChoice", () => {
  it("throws when set has size 0", () => {
    expect(() => consistentHashingChoice(new Set(), "x")).toThrow("size");
  });

  it("for size one it just returns the unique item", () => {
    expect(consistentHashingChoice(new Set(["foo"]), "bar")).toEqual("foo");
  });

  it("for size 3 it gives the same result every time for the same input (and also that it's not stupidly slow)", () => {
    const v = new Set(["a", "b", "x"]);
    const resource = "thing";
    const choice = consistentHashingChoice(v, resource);
    expect(v.has(choice)).toBe(true);
    for (let i = 0; i < 1000; i++) {
      expect(consistentHashingChoice(v, resource)).toBe(choice);
    }
  });

  it("the results are uniformly distributed when the resources are different", () => {
    const v = new Set(["a", "b", "x"]);
    const c = { a: 0, b: 0, x: 0 };
    for (let i = 0; i < 1000; i++) {
      c[consistentHashingChoice(v, `${i}`)] += 1;
    }
    // just roughly in the direction of uniform...
    expect(c.a).toBeGreaterThan(250);
    expect(c.b).toBeGreaterThan(250);
    expect(c.x).toBeGreaterThan(250);
  });
});
