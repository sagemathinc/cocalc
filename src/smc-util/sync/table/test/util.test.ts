/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
