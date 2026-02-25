/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { _passport_key } from "./passport-key";

describe("_passport_key", () => {
  it("formats strategy and id", () => {
    expect(_passport_key({ strategy: "google", id: "123" })).toBe("google-123");
  });

  it("throws when strategy is missing", () => {
    expect(() =>
      _passport_key({ strategy: undefined as unknown as string, id: "123" }),
    ).toThrow("_passport_key: strategy must be defined");
  });

  it("throws when id is missing", () => {
    expect(() =>
      _passport_key({ strategy: "google", id: undefined as unknown as string }),
    ).toThrow("_passport_key: id must be defined");
  });
});
