/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// adopted from https://jestjs.io/docs/mock-functions#mocking-partials
// the goal is to emulate the default behavior without having to actually fetch something from the endpoint
// and we can't load the customize.tsx file directly because it uses "fetch" which is not available in "node"
jest.mock("./customize", () => {
  const { DEFAULT_CUSTOMIZE } = jest.requireActual("./consts");
  return {
    __esModule: true,
    default: jest.fn(() => {
      return DEFAULT_CUSTOMIZE;
    }),
  };
});

import React from "react";
import renderer from "react-test-renderer";
import StartupBanner from "./startup-banner"; // this uses the mocked version of customize.tsx

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
