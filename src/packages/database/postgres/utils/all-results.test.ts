/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { all_results } from "@cocalc/database";

describe("all_results", () => {
  it("returns copies of rows when no pattern is provided", () => {
    const cb = jest.fn();
    const fn = all_results(cb);
    const rows = [{ a: 1 }, { a: 2 }];

    fn(null, { rows });

    expect(cb).toHaveBeenCalledWith(undefined, [{ a: 1 }, { a: 2 }]);
  });

  it("returns array of field values when pattern is a string", () => {
    const cb = jest.fn();
    const fn = all_results("value", cb);

    fn(null, { rows: [{ value: 3 }, { value: null }, { value: 5 }] });

    expect(cb).toHaveBeenCalledWith(undefined, [3, undefined, 5]);
  });

  it("errors on unsupported pattern types", () => {
    const cb = jest.fn();
    const fn = all_results({} as unknown as string, cb);

    fn(null, { rows: [{ value: 1 }] });

    expect(cb).toHaveBeenCalledWith("unsupported pattern type 'object'");
  });
});
