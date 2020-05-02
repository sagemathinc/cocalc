/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fill } from "./fill";
import { expectType } from "tsd";

test("Supplied default should be merged in to target even if marked undefined", () => {
  const opts: { name: string; height?: number } = {
    name: "jack",
    height: undefined,
  };
  const actual = fill(opts, { height: 20 });
  expect(actual).toStrictEqual({ name: "jack", height: 20 });
});

test("Defaults should not overwrite already defined optional params", () => {
  const opts: { name: string; height?: number; weight?: number } = {
    name: "jack",
    height: 20,
  };
  const actual = fill(opts, { height: 30 });
  expect(actual).toStrictEqual({ name: "jack", height: 20 });
});

test("Missing optional params should not appear if not given defaults", () => {
  const opts: { name: string; height?: number; weight?: number } = {
    name: "jack",
  };
  const actual = fill(opts, { height: 20 });
  expect(actual).toStrictEqual({ name: "jack", height: 20 });
});

test("Supplied default should guarantee type existance", () => {
  type Expected = {
    name: string;
    direction: "up" | "down" | "left" | "right";
    highlight: boolean;
    animate?: boolean;
  };

  const opts: {
    name: string;
    direction: "up" | "down" | "left" | "right";
    highlight?: boolean;
    animate?: boolean;
  } = { name: "foo", direction: "up" };

  const actual = fill(opts, { highlight: false });

  expectType<Expected>(actual);
});

test("strings", () => {
  function filled(props: {
    name: string;
    direction: "up" | "down" | "left" | "right";
    highlight?: string;
    animate?: boolean;
  }) {
    // This should not end up narrowing to the fixed value
    return fill(props, { highlight: "fixed_string" });
  }
  const a = filled({ name: "foo", direction: "up" });
  expectType<string>(a.name);
  expectType<"up" | "down" | "left" | "right">(a.direction);
  expectType<string>(a.highlight);
  expectType<boolean | undefined>(a.animate);
});

// tsd expectError doesn't integrate into Jest
test("Errors", () => {
  /*
  function prop_typed_errors(props: {
    name: string;
    direction: "up" | "down" | "left" | "right";
    highlight?: boolean;
    animate?: boolean;
  }) {
    // Don't allow requireds to even be listed
    return fill(props, { name: "undefined", highlight: false });
  }
  */
});
