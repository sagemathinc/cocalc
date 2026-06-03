/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { stripNullFields } from "./strip-null-fields";

describe("stripNullFields", () => {
  it("removes null fields and keeps other values", () => {
    const rows = [
      { a: 1, b: null, c: "ok" },
      { a: null, b: 2, c: undefined },
    ];

    const result = stripNullFields(rows);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ a: 1, c: "ok" });
    expect(result[1].b).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(result[1], "a")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result[1], "c")).toBe(true);
    expect(result[1].c).toBeUndefined();
  });
});
