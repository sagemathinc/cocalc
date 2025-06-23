/*
 * This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 * License: MS-RSL – see LICENSE.md for details
 */

/*
Test opts defaults handling code
*/

declare var process;

process.env.DEVEL = true;
process.env.SMC_TEST = true;

declare var global;

import { defaults, required } from "@cocalc/util/opts";

// Returns a new object with properties determined by those of obj1 and
// obj2.  The properties in obj1 *must* all also appear in obj2.  If an
// obj2 property has value "defaults.required", then it must appear in
// obj1.  For each property P of obj2 not specified in obj1, the
// corresponding value obj1[P] is set (all in a new copy of obj1) to
// be obj2[P].

describe("default", () => {
  const d = defaults;

  let debug_orig, console_debug_stub, console_trace_stub;

  beforeAll(() => {
    debug_orig = global.DEBUG;
    global.DEBUG = true;
  });

  afterAll(() => {
    global.DEBUG = debug_orig;
  });

  beforeEach(() => {
    console_debug_stub = jest.spyOn(console, "warn");
    console_trace_stub = jest.spyOn(console, "trace");
  });

  afterEach(() => {
    console_trace_stub.mockReset();
    console_debug_stub.mockReset();
  });

  it("returns a new object", () => {
    const o1 = {};
    const o2 = {};
    const o3 = d(o1, o2);
    expect(o3).not.toBe(o1);
    expect(o3).not.toBe(o2);
  });

  it("properties of obj1 must appear in obj2", () => {
    const obj1 = {
      foo: 1,
      bar: [1, 2, 3],
      baz: {
        foo: "bar",
      },
    };
    const obj2 = {
      foo: 2,
      bar: [1, 2, 3],
      baz: {
        foo: "bar",
      },
    };
    const exp = {
      foo: 1,
      bar: [1, 2, 3],
      baz: {
        foo: "bar",
      },
    };
    expect(d(obj1, obj2)).toEqual(exp);
  });

  it("raises exception for extra arguments", () => {
    const obj1 = { extra: true };
    const obj2 = {};
    expect(() => d(obj1, obj2)).toThrow(/got an unexpected argument 'extra'/);

    // expect(jest.mocked(console_debug_stub).mock.calls[0]).toEqual({
    //   obj1: { extra: true },
    //   obj2: {},
    // });
  });

  it("doesn't raises exception if extra arguments are allowed", () => {
    const obj1 = { extra: true };
    const obj2 = {};
    d(obj1, obj2, true);
    expect(console_trace_stub).toHaveBeenCalledTimes(0);
    expect(console_debug_stub).toHaveBeenCalledTimes(0);
  });

  it("raises an exception if obj2 has a `required` property but nothing in obj1", () => {
    const obj1 = {};
    const obj2 = { r: required };
    expect(() => d(obj1, obj2)).toThrow(/property \'r\' must be specified/);
  });

  it("raises an exception if obj2 has a `required` property but is undefined in obj1", () => {
    const obj1 = { r: undefined };
    const obj2 = { r: required };
    expect(() => d(obj1, obj2)).toThrow(/property \'r\' must be specified/);
  });
});
