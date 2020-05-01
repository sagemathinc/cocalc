/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {} from "mocha";
import * as expect from "expect";

import * as misc from "../misc";

describe("test the getIn function", function () {
  const obj = { a: { b: { c: 5 } } };
  it("a first test - trivial path", function () {
    expect(misc.getIn(obj, [])).toBe(obj);
  });

  it("a first test - path to nowhere", function () {
    expect(misc.getIn(obj, ["a", "x"])).toBe(undefined);
  });

  it("a first test - path to nowhere with default value", function () {
    expect(misc.getIn(obj, ["a", "x"], "my default")).toBe("my default");
  });

  it("a first test -- full valid path", function () {
    expect(misc.getIn(obj, ["a", "b", "c"])).toBe(5);
  });

  it("a first test -- full valid path with default value", function () {
    expect(misc.getIn(obj, ["a", "b", "c"], "ignored")).toBe(5);
  });

  it("a first test - path to nowhere with null default", function () {
    expect(misc.getIn(obj, ["a", "x"], null)).toBe(null);
  });

  it("a first test - path to middle", function () {
    expect(misc.getIn(obj, ["a", "b"], null)).toEqual({ c: 5 });
  });

  it("a second test - null doesn't trigger the default", function () {
    expect(misc.getIn({ a: { b: null } }, ["a", "b"], "default")).toBe(null);
  });

  it("a second test - undefined triggers the default", function () {
    expect(misc.getIn({ a: { b: undefined } }, ["a", "b"], "default")).toBe(
      "default"
    );
  });
});
