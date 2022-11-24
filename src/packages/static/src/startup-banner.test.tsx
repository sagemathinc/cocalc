import StartupBanner from "./startup-banner";
import React from "react";
import renderer from "react-test-renderer";

describe("verify some simple things about the startup banner", () => {
  jest.spyOn(React, "useEffect").mockImplementation(() => {});
  const component = renderer.create(<StartupBanner />);
  let tree = component.toJSON();
  it("is a div", () => {
    expect(tree.type).toBe("div");
  });
  const s = JSON.stringify(tree, undefined, 2);
  it("contains some classes", () => {
    expect(s).toContain("cocalc-fade-in");
    expect(s).toContain("cocalc-spin");
  });
});
