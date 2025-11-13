/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { to_key } from "../util";

test("convert string to string key", () => {
  expect(to_key("foo")).toBe("foo");
});

test("convert string[] to string key", () => {
  expect(to_key(["foo", "bar"])).toBe('["foo","bar"]');
});

test("convert undefined to string key", () => {
  expect(to_key(undefined)).toBe(undefined);
});

test("convert number to string key", () => {
  // numbers come up in postgresql sequential id primary keys
  expect(to_key(10)).toBe("10");
});
