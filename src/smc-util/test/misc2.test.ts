/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc from "../misc";

describe("rpad_html", () => {
  const rp = misc.rpad_html;
  test("0", () => expect(rp(0, 3)).toEqual("&nbsp;&nbsp;0"));
  test("99", () => expect(rp(99, 3)).toEqual("&nbsp;99"));
  test("4444-5", () => expect(rp(4444, 5)).toEqual("&nbsp;4444"));
  test("6666-4", () => expect(rp(6666, 4)).toEqual("6666"));
  test("1000-4", () => expect(rp(1000, 4)).toEqual("1000"));
  test("1000-3", () => expect(rp(1000, 3)).toEqual("1000"));
});

describe("path_split", () => {
  const ps = misc.path_split;

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
  const cu = misc.contains_url;

  test("normal html is fine", () =>
    expect(cu("<h2>foo</h2><div>bar</div>")).toBe(false));

  test("detects URLs", () => {
    expect(cu("<p><a href='http://foo.com'>click me</a></p>")).toBe(true);
    expect(cu("abc bar.com xyz")).toBe(true);
    expect(cu("abc www.buy.me xyz")).toBe(true);
  });
});

describe("date object some time ago", () => {
  test("roughly 10 mins ago", () => {
    const res = misc.minutes_ago(10);
    const diff = new Date().getTime() - res.getTime();
    expect(diff).toBeLessThan(10 * 60 * 1000 + 100);
    expect(diff).toBeGreaterThan(10 * 60 * 1000 - 100);
  });
  test("2 months ago", () => {
    const res = misc.months_ago(2);
    const diff = new Date().getTime() - res.getTime();
    expect(diff).toBeLessThan(2 * 31 * 24 * 60 * 60 * 1000);
    expect(diff).toBeGreaterThan(2 * 30 * 24 * 60 * 60 * 1000);
  });
});

describe("how_long_ago_m", () => {
  test("10 min ago  by Date", () => {
    const past: Date = misc.minutes_ago(10);
    const diff = misc.how_long_ago_m(past);
    expect(diff).toBeLessThan(10.1);
    expect(diff).toBeGreaterThan(9.9);
  });

  test("10 min ago  by timestamp", () => {
    const past: number = misc.minutes_ago(10).getTime();
    const diff = misc.how_long_ago_m(past);
    expect(diff).toBeLessThan(10.1);
    expect(diff).toBeGreaterThan(9.9);
  });
});
