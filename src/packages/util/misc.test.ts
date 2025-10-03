/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import seedrandom from "seedrandom";
import * as misc from "./misc";

describe("academic domain", () => {
  const ia = misc.isAcademic;

  test("denies non academics", () => {
    expect(ia("foo@bar.com")).toBe(false);
    expect(ia("foo@xxxac.at")).toBe(false);
    expect(ia("foo@bar.gov")).toBe(false);
    expect(ia("me@name.ac.com")).toBe(false);
    expect(ia("foo@name.edu.gov")).toBe(false);
  });

  test("detects academics", () => {
    expect(ia("me@name.ac.at")).toBe(true);
    expect(ia("me@name.ac.il")).toBe(true);
    expect(ia("name@university.ac.uk")).toBe(true);
    expect(ia("name+123@sabanciuniv.edu.tr")).toBe(true);
    expect(ia("student123@stuff.edu")).toBe(true);
  });
});

describe("rpad_html", () => {
  const rp = misc.rpad_html;
  const round1 = misc.round1;
  test("0", () => expect(rp(0, 3)).toEqual("&nbsp;&nbsp;0"));
  test("99", () => expect(rp(99, 3)).toEqual("&nbsp;99"));
  test("4444-5", () => expect(rp(4444, 5)).toEqual("&nbsp;4444"));
  test("6666-4", () => expect(rp(6666, 4)).toEqual("6666"));
  test("1000-4", () => expect(rp(1000, 4)).toEqual("1000"));
  test("1000-3", () => expect(rp(1000, 3)).toEqual("1000"));
  test("pi-1", () => expect(rp(3.1415, 4, round1)).toEqual("&nbsp;3.1"));
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

describe("json patch test", () => {
  const j = misc.test_valid_jsonpatch;
  test("empty array is fine", () => expect(j([])).toBe(true));
  test("a complete example is fine", () => {
    // taken from https://jsonpatch.com/
    const patch = [
      { op: "add", path: "/biscuits/1", value: { name: "Ginger Nut" } },
      { op: "remove", path: "/biscuits" },
      { op: "remove", path: "/biscuits/0" },
      { op: "replace", path: "/biscuits/0/name", value: "Chocolate Digestive" },
      { op: "copy", from: "/biscuits/0", path: "/best_biscuit" },
      { op: "move", from: "/biscuits", path: "/cookies" },
      { op: "test", path: "/best_biscuit/name", value: "Choco Leibniz" },
    ];

    expect(j(patch)).toBe(true);
  });
  test("fails with broken examples", () => {
    expect(
      j({ op: "add", path: "/biscuits/1", value: { name: "Ginger Nut" } }),
    ).toBe(false);
    expect(j([{ opp: "remove", path: "/biscuits" }])).toBe(false);
    expect(j([{ path: "/biscuits/0" }])).toBe(false);
    expect(j([{ op: "replacce", path: "/biscuits/0/name" }])).toBe(false);
  });
});

test("firstLetterUppercase", () => {
  const s = misc.firstLetterUppercase;
  expect(s(undefined)).toBe("");
  expect(s("")).toBe("");
  expect(s("a")).toBe("A");
  expect(s("abc")).toBe("Abc");
  expect(s("ABC")).toBe("ABC");
  expect(s("aBC")).toBe("ABC");
});

test("hexColorToRGBA", () => {
  const c1 = misc.hexColorToRGBA("#000000");
  expect(c1).toEqual("rgb(0,0,0)");
  const c2 = misc.hexColorToRGBA("#ffffff", 0.5);
  expect(c2).toEqual("rgba(255,255,255,0.5)");
});

test("strictMod", () => {
  const mod = misc.strictMod;
  expect(mod(0, 3)).toBe(0);
  expect(mod(1, 3)).toBe(1);
  expect(mod(-2, 3)).toBe(1);
  expect(mod(-3, 3)).toBe(0);
  expect(mod(-1, 10)).toBe(9);
});

test("EDITOR_PREFIX", () => {
  // don't change it, because codebase is not using the global variable everywhere
  expect(misc.EDITOR_PREFIX).toBe("editor-");
});

describe("test code for displaying numbers as currency with 2 or sometimes 3 decimals of precision", () => {
  const { currency } = misc;
  it("displays 1.23", () => {
    expect(currency(1.23)).toBe("$1.23");
  });

  it("displays 0.0094 with 3 digits (not 2), but only because n is less than 0.01", () => {
    expect(currency(0.0094)).toBe("$0.009");
  });

  it("displays 0.1941 with 2, because n is not less than 0.01", () => {
    expect(currency(0.1941)).toBe("$0.19");
  });
  it("displays 0.01941 with 2, because n is not less than 0.01", () => {
    expect(currency(0.01941)).toBe("$0.02");
  });

  it("displays 0.0941 with 2 digits if second argument specifies that", () => {
    expect(currency(0.0941, 2)).toBe("$0.09");
  });

  it("displays 0.086 with 2 digits if second argument specifies that, and it is rounded to nearest", () => {
    expect(currency(0.086, 2)).toBe("$0.09");
  });

  it("displays 0.083 with 2 digits if second argument specifies that, and it is rounded to nearest (NOT up)", () => {
    expect(currency(0.083, 2)).toBe("$0.08");
  });

  it("always includes at least 2 decimals", () => {
    expect(currency(10)).toBe("$10.00");
  });
});

describe("smallIntegerToEnglishWord", () => {
  it("handles floats", () => {
    expect(misc.smallIntegerToEnglishWord(1.2)).toBe(1.2);
  });

  it("handles 0", () => {
    expect(misc.smallIntegerToEnglishWord(0)).toBe("zero");
  });

  it("handles 1", () => {
    expect(misc.smallIntegerToEnglishWord(1)).toBe("one");
  });

  it("handles 17", () => {
    expect(misc.smallIntegerToEnglishWord(17)).toBe("seventeen");
  });

  it("handles negative numbers", () => {
    expect(misc.smallIntegerToEnglishWord(-1)).toBe(-1);
  });
});

describe("test round2up and round2down for various inputs", () => {
  const { round2up, round2down } = misc;
  it("round2up tests -- uses the decimal representation (not internal binary))", () => {
    // see https://github.com/sagemathinc/cocalc/issues/7220
    expect(round2up(20.01)).toBe(20.01);
    expect(round2up(20.011)).toBe(20.02);
    expect(round2up(20.01999)).toBe(20.02);
    expect(round2up(4.73)).toBe(4.73);
    expect(round2up(4.731)).toBe(4.74);
    expect(round2up(4.736)).toBe(4.74);
  });

  it("round2down tests -- uses the decimal representation (not internal binary))", () => {
    // see https://github.com/sagemathinc/cocalc/issues/7220
    expect(round2down(20.01)).toBe(20.01);
    expect(round2down(20.011)).toBe(20.01);
    expect(round2down(20.019)).toBe(20.01);
    expect(round2down(4.73)).toBe(4.73);
    expect(round2down(4.731)).toBe(4.73);
    expect(round2down(4.736)).toBe(4.73);
  });

  it("a random test of 1000 cases", () => {
    let seed = "my-seed";
    let rng = seedrandom(seed);

    for (let i = 0; i < 1000; i++) {
      let randomNum = rng(); // Returns a number between 0 and 1
      // Perform your tests with randomNum
      // For example:
      expect(round2up(randomNum)).toBeGreaterThanOrEqual(randomNum);
      expect(round2up(randomNum)).toBeLessThan(randomNum + 0.01);
      expect(round2down(randomNum)).toBeLessThanOrEqual(randomNum);
      expect(round2down(randomNum)).toBeGreaterThan(randomNum - 0.01);
    }
  });
});

describe("numToOrdinal", () => {
  const { numToOrdinal } = misc;
  it("appends proper suffixes", () => {
    expect(numToOrdinal(1)).toBe("1st");
    expect(numToOrdinal(2)).toBe("2nd");
    expect(numToOrdinal(3)).toBe("3rd");
    expect(numToOrdinal(4)).toBe("4th");
    expect(numToOrdinal(5)).toBe("5th");
    expect(numToOrdinal(6)).toBe("6th");
    expect(numToOrdinal(7)).toBe("7th");
    expect(numToOrdinal(8)).toBe("8th");
    expect(numToOrdinal(9)).toBe("9th");
    expect(numToOrdinal(10)).toBe("10th");
    expect(numToOrdinal(11)).toBe("11th");
    expect(numToOrdinal(12)).toBe("12th");
    expect(numToOrdinal(13)).toBe("13th");
    expect(numToOrdinal(21)).toBe("21st");
    expect(numToOrdinal(22)).toBe("22nd");
    expect(numToOrdinal(23)).toBe("23rd");
    expect(numToOrdinal(24)).toBe("24th");
    expect(numToOrdinal(42)).toBe("42nd");
    expect(numToOrdinal(101)).toBe("101st");
    expect(numToOrdinal(202)).toBe("202nd");
    expect(numToOrdinal(303)).toBe("303rd");
    expect(numToOrdinal(1000)).toBe("1000th");
  });
  it("Falls back in other cases", () => {
    expect(numToOrdinal(-1)).toBe("-1th");
  });
});

describe("hoursToTimeIntervalHuman", () => {
  const { hoursToTimeIntervalHuman } = misc;
  it("converts nicely", () => {
    expect(hoursToTimeIntervalHuman(1)).toBe("1 hour");
    expect(hoursToTimeIntervalHuman(13.333)).toBe("13.3 hours");
    expect(hoursToTimeIntervalHuman(13.888)).toBe("13.9 hours");
    expect(hoursToTimeIntervalHuman(24)).toBe("1 day");
    expect(hoursToTimeIntervalHuman(24 * 7)).toBe("1 week");
    expect(hoursToTimeIntervalHuman(2)).toBe("2 hours");
    expect(hoursToTimeIntervalHuman(2 * 24)).toBe("2 days");
    expect(hoursToTimeIntervalHuman(5 * 7 * 24)).toBe("5 weeks");
    expect(hoursToTimeIntervalHuman(2.5111 * 24)).toBe("2.5 days");
    expect(hoursToTimeIntervalHuman(2.5111 * 24 * 7)).toBe("2.5 weeks");
  });
});

describe("tail", () => {
  const s = `
foo
bar
baz
abc
xyz
test 123`;
  const { tail } = misc;
  it("return the last 3 lines", () => {
    const t = tail(s, 3);
    expect(t.split("\n").length).toEqual(3);
    expect(t.startsWith("abc")).toBe(true);
  });
  it("return the last line", () => {
    const t = tail("foo", 3);
    expect(t.split("\n").length).toEqual(1);
    expect(t).toEqual("foo");
  });
});

describe("suggest_duplicate_filename", () => {
  const dup = misc.suggest_duplicate_filename;
  it("works with numbers", () => {
    expect(dup("filename-1.test")).toBe("filename-2.test");
    expect(dup("filename-99.test")).toBe("filename-100.test");
    expect(dup("filename_99.test")).toBe("filename_100.test");
  });
  it("handles leading zeros", () => {
    // handles leading 0's properly: https://github.com/sagemathinc/cocalc/issues/2973
    expect(dup("filename_001.test")).toBe("filename_002.test");
  });
  it("works also without", () => {
    expect(dup("filename-test")).toBe("filename-test-1");
    expect(dup("filename-xxx.test")).toBe("filename-xxx-1.test");
    expect(dup("bla")).toBe("bla-1");
    expect(dup("foo.bar")).toBe("foo-1.bar");
  });
  it("also works with weird corner cases", () => {
    expect(dup("asdf-")).toBe("asdf--1");
  });
});

describe("is_valid email_address", () => {
  const ivea = misc.is_valid_email_address;
  test("valid", () => {
    expect(ivea("foo@bar.com")).toBe(true);
    expect(ivea("foo+bar@bar.com")).toBe(true);
    expect(ivea("foo.bar@bar.com")).toBe(true);
    expect(ivea("foo-bar@bar.com")).toBe(true);
    expect(ivea("foo_bar@bar.com")).toBe(true);
    expect(ivea("123@bar.com")).toBe(true);
    expect(ivea("foo@123.com")).toBe(true);
    expect(ivea("foo@bar.co.uk")).toBe(true);
    expect(ivea("foobar@bar.com")).toBe(true);
    expect(ivea("foo.bar@bar.com")).toBe(true);
    expect(ivea("foo+bar@bar.com")).toBe(true);
    expect(ivea("FOO@BAR.BAZ")).toBe(true);
  });
  test("invalid", () => {
    expect(ivea(123)).toBe(false);
    expect(ivea({})).toBe(false);
    expect(ivea([])).toBe(false);
    expect(ivea(null)).toBe(false);
    expect(ivea(undefined)).toBe(false);
    expect(ivea("abc")).toBe(false);
    expect(ivea("abc@foo@bar.com")).toBe(false);
    expect(ivea("foo@bar.")).toBe(false);
    expect(ivea("foo@.bar.com")).toBe(false);
    expect(ivea("foo@bar..com")).toBe(false);
    expect(ivea("@bar.com")).toBe(false);
    expect(ivea("foo@")).toBe(false);
    expect(ivea("foo")).toBe(false);
    expect(ivea("foo bar@bar.com")).toBe(false);
    expect(ivea("foo@bar@bar.com")).toBe(false);
  });
});
