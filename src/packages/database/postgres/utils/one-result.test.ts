/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { one_result } from "@cocalc/database";

describe("one_result", () => {
  it("returns undefined when no rows", () => {
    const cb = jest.fn();
    const fn = one_result(cb);

    fn(null, { rows: [] });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0].length).toBe(0);
  });

  it("returns mapped object when pattern is omitted", () => {
    const cb = jest.fn();
    const fn = one_result(cb);

    fn(null, { rows: [{ a: 1, b: null, c: undefined }] });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][1]).toEqual({ a: 1 });
  });

  it("returns the field value when pattern is a string", () => {
    const cb = jest.fn();
    const fn = one_result("value", cb);

    fn(null, { rows: [{ value: 5, expire: new Date(Date.now() + 5000) }] });

    expect(cb).toHaveBeenCalledWith(undefined, 5);
  });

  it("returns undefined when expire is in the past", () => {
    const cb = jest.fn();
    const fn = one_result("value", cb);

    fn(null, { rows: [{ value: 5, expire: new Date(Date.now() - 5000) }] });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0].length).toBe(0);
  });

  it("returns subset when pattern is an array", () => {
    const cb = jest.fn();
    const fn = one_result(["a", "c"], cb);

    fn(null, { rows: [{ a: 1, b: 2, c: 3 }] });

    expect(cb).toHaveBeenCalledWith(undefined, { a: 1, c: 3 });
  });

  it("errors on multiple rows", () => {
    const cb = jest.fn();
    const fn = one_result(cb);

    fn(null, { rows: [{ a: 1 }, { a: 2 }] });

    expect(cb).toHaveBeenCalledWith("more than one result");
  });

  it("errors on unknown pattern type", () => {
    const cb = jest.fn();
    const fn = one_result(123 as unknown as string, cb);

    fn(null, { rows: [{ a: 1 }] });

    expect(cb).toHaveBeenCalledWith("BUG: unknown pattern -- 123");
  });
});
