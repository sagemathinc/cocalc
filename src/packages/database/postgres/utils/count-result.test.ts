/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { count_result } from "@cocalc/database";

describe("count_result", () => {
  it("parses count from query result", () => {
    const cb = jest.fn();
    const fn = count_result(cb);

    fn(null, { rows: [{ count: "12" }] });

    expect(cb).toHaveBeenCalledWith(undefined, 12);
  });

  it("propagates errors", () => {
    const cb = jest.fn();
    const fn = count_result(cb);
    const err = new Error("nope");

    fn(err, { rows: [] });

    expect(cb).toHaveBeenCalledWith(err);
  });
});
