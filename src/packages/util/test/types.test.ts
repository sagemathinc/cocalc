/*
 * This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 * License: MS-RSL – see LICENSE.md for details
 */

/*
Test type checking functionality

IF THESE TESTS FAIL, CHECK `echo $NODE_ENV`. NODE_ENV=production will cause these tests to fail.
NODE_ENV=development to correctly use this file

NOTE: You can't use `mocha -w` to work on this file, because it doesn't reset the warnings
internally between runs.

NOTE2: Some object key names are slightly different from others due to working around
https://github.com/facebook/react/issues/6293
*/

declare var process;

process.env.DEVEL = true;
process.env.SMC_TEST = true;

import { Map, List, Stack, Set } from "immutable";

import { types } from "@cocalc/util/opts";

describe("throws with non-objects", () => {
  it("fails if first argument is non-object", () => {
    expect(() => types(1 as any, { a: types.number })).toThrow();
  });

  it("fails if second argument is non-object", () => {
    expect(() => types({ a: 2 }, 3 as any)).toThrow();
  });
});

describe("test a basic type check", () => {
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorMock = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it("succeeds", () => {
    types({ a: 5 }, { a: types.number });
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  });

  it("fails", () => {
    types({ a: 5 }, { a: types.string });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Invalid checking a `a` of type `number` supplied to `check.types`, expected `string`./,
    );
  });
});

describe("checking immutable Map", () => {
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorMock = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it("succeeds", () => {
    types({ a: Map({ a: 4 }) }, { a: types.immutable.Map });
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  });

  it("fails", () => {
    types({ a: 4 }, { a: types.immutable.Map });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.Map \[object Object\], a/,
    );
  });

  it("works with isRequired", () => {
    types({ c: 4 }, { a: types.immutable.Map.isRequired });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Required prop `a` was not specified in `check.types`/,
    );
  });

  it("checks against other immutable types", () => {
    types({ b: List([1, 2]) }, { b: types.immutable.Map });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Component `check.types` expected b to be an immutable.Map but was supplied List \[ 1, 2 \]/,
    );
  });
});

describe("checking immutable List", () => {
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorMock = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it("succeeds", () => {
    types({ a: List([1, 2, 3, 4]) }, { a: types.immutable.List });
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  });

  it("fails", () => {
    types({ a: 4 }, { a: types.immutable.List });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.List \[object Object\], a/,
    );
  });

  it("works with isRequired", () => {
    types({ c: 4 }, { b: types.immutable.List.isRequired });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Required prop `b` was not specified in `check.types`/,
    );
  });

  it("checks against other immutable types", () => {
    types({ b: Map({ a: 4 }) }, { b: types.immutable.List });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Component `check.types` expected b to be an immutable.List but was supplied Map \{ "a": 4 \}/,
    );
  });
});

describe("checking immutable Set", () => {
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorMock = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it("succeeds", () => {
    types({ a: Set([1, 2, 3, 4]) }, { a: types.immutable.Set });
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  });

  it("fails", () => {
    types({ a: { b: 4 } }, { a: types.immutable.Set });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.Set \[object Object\], a/,
    );
  });

  it("works with isRequired", () => {
    types({ a: 4 }, { c: types.immutable.Set.isRequired });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Required prop `c` was not specified in `check.types`/,
    );
  });

  it("checks against other immutable types", () => {
    types({ b: Map({ a: 4 }) }, { b: types.immutable.Set });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Component `check.types` expected b to be an immutable.Set but was supplied Map \{ "a": 4 \}/,
    );
  });
});

describe("checking immutable Stack", () => {
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorMock = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it("succeeds", () => {
    types({ a: Stack([1, 2, 4]) }, { a: types.immutable.Stack });
    expect(consoleErrorMock).toHaveBeenCalledTimes(0);
  });

  it("fails", () => {
    types({ a: 2 }, { a: types.immutable.Stack });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: NOT EVEN IMMUTABLE, wanted immutable.Stack \[object Object\], a/,
    );
  });

  it("works with isRequired", () => {
    types({ c: 4 }, { d: types.immutable.Stack.isRequired });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Required prop `d` was not specified in `check.types`/,
    );
  });

  it("checks against other immutable types", () => {
    types({ b: Map({ a: 4 }) }, { b: types.immutable.Stack });
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock.mock.calls[0][0]).toMatch(
      /Warning: Failed checking a type: Component `check.types` expected b to be an immutable.Stack but was supplied Map \{ "a": 4 \}/,
    );
  });
});
