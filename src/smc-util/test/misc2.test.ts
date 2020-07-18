/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc2 from "../misc2";

describe("path_split", () => {
  const ps = misc2.path_split;

  test("full path", () =>
    expect(ps("foo/bar")).toEqual({ head: "foo", tail: "bar" }));

  test("filename", () =>
    expect(ps("foo.bar.baz")).toEqual({ head: "", tail: "foo.bar.baz" }));

  test("dirname", () => expect(ps("foo/")).toEqual({ head: "foo", tail: "" }));

  test("abspath", () =>
    expect(ps("/HOME/USER/DIR")).toEqual({
      head: "/HOME/USER",
      tail: "DIR",
    }));

  test("ROOT", () => expect(ps("/")).toEqual({ head: "", tail: "" }));
});

describe("contains_url", () => {
  const cu = misc2.contains_url;

  test("normal html is fine", () =>
    expect(cu("<h2>foo</h2><div>bar</div>")).toBe(false));

  test("detects URLs", () => {
    expect(cu("<p><a href='http://foo.com'>click me</a></p>")).toBe(true);
    expect(cu("abc bar.com xyz")).toBe(true);
    expect(cu("abc www.buy.me xyz")).toBe(true);
  });
});
