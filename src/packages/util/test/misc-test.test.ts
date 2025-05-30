/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import immutable from "immutable";

import * as misc from "@cocalc/util/misc";

describe("should.js behavior", () => {
  it("tests that should.js throws errors", () => {
    expect(() => expect(false).toBe(true)).toThrow();
    expect(() => expect(false).toBe(true)).not.toThrow();
  });
});

describe("expect behavior", () => {
  it("throws when wrapped in a function", () => {
    expect(() => expect(false).toBe(true)).toThrow();
  });
});

describe("sinon replacement with Jest", () => {
  it("is working with spies", () => {
    const object = { method: jest.fn((_x: number) => ({})) };
    object.method(1);
    object.method(42);
    object.method(1);

    expect(object.method).toHaveBeenCalledWith(1);
    expect(object.method).toHaveBeenCalledWith(42);
    expect(object.method).toHaveBeenCalledTimes(3);
    const calls = object.method.mock.calls;
    expect(calls.filter((call) => call[0] === 1).length).toBe(2);
    expect(calls.filter((call) => call[0] === 42).length).toBe(1);
  });

  it("unit test with spies", () => {
    const callback = jest.fn((_x?: string) => {});
    expect(callback).toHaveBeenCalledTimes(0);

    callback();
    expect(callback).toHaveBeenCalledTimes(1);

    callback("xyz");
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[1][0]).toBe("xyz");
    expect(() => expect(callback.mock.calls[1][0]).toBe("1")).toThrow();
    expect(callback.mock.calls[1][0]).toBe("xyz");
  });

  describe("Jest mocks", () => {
    it("works for withArgs", () => {
      const func = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error();
        })
        .mockImplementation((arg) => {
          if (arg === 42) return 1;
          throw new Error();
        });

      expect(func(42)).toBe(1);
      expect(() => func(1)).toThrow(Error);
    });

    it("works for onCall", () => {
      const func = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error();
        })
        .mockImplementationOnce(() => 42);

      expect(() => func()).toThrow(Error);
      expect(func()).toBe(42);
    });
  });
});

describe("seconds2hms", () => {
  const s2hms = misc.seconds2hms;
  const s2hm = misc.seconds2hm;
  const m = 60; // one minute
  const h = 60 * m; // one hour
  const d = 24 * h; // one day

  it("converts to short form", () => {
    expect(s2hms(0)).toBe("0s");
    expect(s2hms(1.138)).toBe("1.14s");
    expect(s2hms(15.559)).toBe("15.6s");
    expect(s2hms(60)).toBe("1m0s");
    expect(s2hms(61)).toBe("1m1s");
    expect(s2hms(3601)).toBe("1h0m1s");
    expect(s2hms(7300)).toBe("2h1m40s");
  });

  it("converts to long form", () => {
    expect(s2hms(0, true)).toBe("0 seconds");
    expect(s2hms(1.138, true)).toBe("1 second");
    expect(s2hms(15.559, true)).toBe("16 seconds");
    expect(s2hms(61, true)).toBe("1 minute 1 second");
    expect(s2hms(3601, true)).toBe("1 hour");
    expect(s2hms(7300, true)).toBe("2 hours 1 minute");
  });

  it("converts to short form in minute resolution", () => {
    expect(s2hm(0)).toBe("0m");
    expect(s2hm(60)).toBe("1m");
    expect(s2hm(61)).toBe("1m");
    expect(s2hm(3601)).toBe("1h0m");
    expect(s2hm(7300)).toBe("2h1m");
    expect(s2hm(36000)).toBe("10h0m");
  });

  it("converts to long form in minute resolution", () => {
    expect(s2hm(0, true)).toBe("0 minutes");
    expect(s2hm(60, true)).toBe("1 minute");
    expect(s2hm(61, true)).toBe("1 minute");
    expect(s2hm(3601, true)).toBe("1 hour");
    expect(s2hm(7300, true)).toBe("2 hours 1 minute");
    expect(s2hm(36000, true)).toBe("10 hours");
  });

  it("converts to short form in days resolution", () => {
    expect(s2hm(d + 2 * h + 1 * m)).toBe("1d2h1m");
    expect(s2hm(21 * d + 19 * h - 1)).toBe("21d18h59m");
    expect(s2hm(1 * d)).toBe("1d");
    expect(s2hm(1 * d + 3 * m)).toBe("1d3m");
  });

  it("converts to long form in hour days resolution", () => {
    expect(s2hm(1 * d + 2 * h + 1 * m, true)).toBe("1 day 2 hours 1 minute");
    expect(s2hm(21 * d + 19 * h - 1, true)).toBe("21 days 18 hours 59 minutes");
    expect(s2hm(1 * d, true)).toBe("1 day");
    expect(s2hm(1 * d + 3 * m, true)).toBe("1 day 3 minutes");
  });
});

describe("startswith", () => {
  const startswith = misc.startswith;

  it('checks that "foobar" starts with foo', () => {
    expect(startswith("foobar", "foo")).toBe(true);
  });

  it('checks that "foobar" does not start with bar', () => {
    expect(startswith("foobar", "bar")).toBe(false);
  });

  it("works well with too long search strings", () => {
    expect(startswith("bar", "barfoo")).toBe(false);
  });

  it('checks that "bar" starts in any of the given strings (a list)', () => {
    expect(startswith("barbatz", ["aa", "ab", "ba", "bb"])).toBe(true);
  });

  it('checks that "catz" does not start with any of the given strings (a list)', () => {
    expect(startswith("catz", ["aa", "ab", "ba", "bb"])).toBe(false);
  });
});

describe("endswith", () => {
  const endswith = misc.endswith;

  it('checks that "foobar" ends with "bar"', () => {
    expect(endswith("foobar", "bar")).toBe(true);
  });

  it('checks that "foobar" does not end with "foo"', () => {
    expect(endswith("foobar", "foo")).toBe(false);
  });

  it("works well with too long search strings", () => {
    expect(endswith("foo", "foobar")).toBe(false);
  });

  it("doesn't work with arrays", () => {
    expect(() => endswith("foobar", ["aa", "ab"])).not.toThrow();
  });

  it("is false if either argument is undefined", () => {
    expect(endswith(undefined, "...")).toBe(false);
    expect(endswith("...", undefined)).toBe(false);
    expect(endswith(undefined, undefined)).toBe(false);
  });
});

describe("the Python flavoured split function", () => {
  const split = misc.split;

  it("splits correctly on whitespace", () => {
    const s = "this is a   sentence";
    expect(split(s)).toEqual(["this", "is", "a", "sentence"]);
  });

  it("splits also on linebreaks and special characters", () => {
    const s2 = `we'll have
               a lot (of)
               fun\nwith sp|äci|al cħæ¶ä¢ŧ€rß`;
    expect(split(s2)).toEqual([
      "we'll",
      "have",
      "a",
      "lot",
      "(of)",
      "fun",
      "with",
      "sp|äci|al",
      "cħæ¶ä¢ŧ€rß",
    ]);
  });

  it("handles empty and no matches correctly", () => {
    expect(split("")).toEqual([]);
    expect(split("\t")).toEqual([]);
  });
});

describe("search_split is like split, but quoted terms are grouped together", () => {
  const ss = misc.search_split;

  it("correctly with special characters", () => {
    const s1 = `Let's check how "quotation marks" and "sp|äci|al cħæ¶ä¢ŧ€rß" behave.`;
    expect(ss(s1)).toEqual([
      "Let's",
      "check",
      "how",
      "quotation marks",
      "and",
      "sp|äci|al cħæ¶ä¢ŧ€rß",
      "behave.",
    ]);
  });

  it("correctly splits across line breaks", () => {
    const s2 = `this "text in quotes\n with a line-break" ends here`;
    expect(ss(s2)).toEqual([
      "this",
      "text in quotes\n with a line-break",
      "ends",
      "here",
    ]);
  });

  it("also doesn't stumble over uneven quotations", () => {
    const s3 = `1 "a b c" d e f "g h i" "j k"`;
    expect(ss(s3)).toEqual(["1", "a b c", "d", "e", "f", "g h i", "j", "k"]);
  });
});

describe("merge", () => {
  const merge = misc.merge;

  it("checks that {a:5} merged with {b:7} is {a:5,b:7}", () => {
    expect(merge({ a: 5 }, { b: 7 })).toEqual({ a: 5, b: 7 });
  });

  it("checks that x={a:5} merged with {b:7} mutates x to be {a:5,b:7}", () => {
    const x = { a: 5 };
    merge(x, { b: 7 });
    expect(x).toEqual({ a: 5, b: 7 });
  });

  it("checks that duplicate keys are overwritten by the second entry", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 3 };
    merge(a, b);
    expect(a).toEqual({ x: 3, y: 2 });
  });

  it("variable number of arguments are supported", () => {
    const a = { x: 1 };
    const b = { y: 2 };
    const c = { z: 3 };
    const d = { u: 4 };
    const w = { v: 5, x: 0 };
    const r = merge(a, b, c, d, w);
    const res = { x: 0, y: 2, z: 3, u: 4, v: 5 };
    expect(r).toEqual(res);
    expect(a).toEqual(res);
  });
});

describe("cmp", () => {
  const cmp = misc.cmp;

  it("compares 4 and 10 and returns a negative number", () => {
    expect(cmp(4, 10)).toBeLessThan(0);
  });

  it("compares 10 and 4 and returns a positive number", () => {
    expect(cmp(10, 4)).toBeGreaterThan(0);
  });

  it("compares 10 and 10 and returns 0", () => {
    expect(cmp(10, 10)).toBe(0);
  });
});

describe("walltime functions", () => {
  const t0 = 10000000;

  describe("mswalltime measures in milliseconds", () => {
    it("should be in milliseconds", () => {
      expect(misc.mswalltime()).toBeLessThan(10000000000000);
    });

    it("computes differences", () => {
      expect(misc.mswalltime(t0)).toBeGreaterThan(1000000000000);
    });
  });

  describe("walltime measures in seconds", () => {
    it("should be in seconds", () => {
      expect(misc.walltime()).toBeGreaterThan(1435060052);
      expect(misc.walltime(1000 * t0)).toBeLessThan(100000000000);
    });
  });
});

describe("uuid", () => {
  const uuid = misc.uuid;
  const cnt = misc.count;
  const ivuuid = misc.is_valid_uuid_string;

  it("generates random stuff in a certain pattern", () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      const u = uuid();
      expect(ids).not.toContain(u);
      ids.push(u);
      expect(u).toHaveLength(36);
      expect(cnt(u, "-")).toBe(4);
      expect(ivuuid(u)).toBe(true);
    }
  });

  describe("is_valid_uuid_string", () => {
    it("checks the UUID pattern", () => {
      expect(ivuuid("C56A4180-65AA-42EC-A945-5FD21DEC")).toBe(false);
      expect(ivuuid("")).toBe(false);
      expect(ivuuid("!")).toBe(false);
      expect(ivuuid("c56a4180-65aa-4\nec-a945-5fd21dec0538")).toBe(false);
      expect(ivuuid("77897c43-dbbc-4672 9a16-6508f01e0039")).toBe(false);
      expect(ivuuid("c56a4180-65aa-42ec-a945-5fd21dec0538")).toBe(true);
      expect(ivuuid("77897c43-dbbc-4672-9a16-6508f01e0039")).toBe(true);
    });
  });
});

describe("to_json", () => {
  const to_json = misc.to_json;

  it("converts a list of objects to json", () => {
    const input = ["hello", { a: 5, b: 37.5, xyz: "123" }];
    const exp = '["hello",{"a":5,"b":37.5,"xyz":"123"}]';
    expect(to_json(input)).toBe(exp);
    expect(typeof to_json(input)).toBe("string");
  });

  it("behaves fine with empty arguments", () => {
    expect(to_json([])).toBe("[]");
  });
});

describe("from_json", () => {
  const from_json = misc.from_json;

  it("parses a JSON string", () => {
    const input = '["hello",{"a":5,"b":37.5,"xyz":"123"}]';
    const exp = ["hello", { a: 5, b: 37.5, xyz: "123" }];
    expect(from_json(input)).toEqual(exp);
    expect(from_json(input)).toBeInstanceOf(Object);
  });

  it("throws an error for garbage", () => {
    expect(() => from_json('{"x": ]')).toThrow(/^Unexpected token/);
  });
});

describe("to_safe_str", () => {
  const tss = misc.to_safe_str;

  it("removes keys containing pass", () => {
    const exp = '{"remove_pass":"(unsafe)","me":"not"}';
    expect(tss({ remove_pass: "yes", me: "not" })).toBe(exp);
  });

  it("removes key where the value starts with sha512$", () => {
    const exp = '{"delme":"(unsafe)","x":42}';
    expect(tss({ delme: "sha512$123456789", x: 42 })).toBe(exp);
  });

  it("truncates long string values when serializing an object", () => {
    const large = {
      delme: {
        yyyyy: "zzzzzzzzzzzzzz",
        aaaaa: "bbbbbbbbbbbbbb",
        ccccc: "dddddddddddddd",
        eeeee: "ffffffffffffff",
      },
      keep_me: 42,
    };
    const exp = '{"delme":"[object]","keep_me":42}';
    expect(tss(large)).toBe(exp);
  });
});

describe("dict, like in Python", () => {
  const dict = misc.dict;

  it("converts a list of tuples to a mapping", () => {
    const input: [string, any][] = [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ];
    expect(dict(input)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("throws on tuples longer than 2", () => {
    const input: [string, any][] = [["foo", 1, 2, 3] as any];
    expect(() => dict(input)).toThrow(/unexpected length/);
  });
});

describe("remove, like in Python", () => {
  const rm = misc.remove;

  it("removes the first occurrence in a list", () => {
    const input = [1, 2, "x", 8, "y", "x", "zzz", [1, 2], "x"];
    const exp = [1, 2, 8, "y", "x", "zzz", [1, 2], "x"];
    rm(input, "x");
    expect(input).toEqual(exp);
  });

  it("throws an exception if val not in list", () => {
    const input = [1, 2, "x", 8, "y", "x", "zzz", [1, 2], "x"];
    const exp = [1, 2, "x", 8, "y", "x", "zzz", [1, 2], "x"];
    expect(() => rm(input, "z")).toThrow(/item not in array/);
    expect(input).toEqual(exp);
  });

  it("works with an empty argument", () => {
    expect(() => rm([], undefined)).toThrow(/item not in array/);
  });
});

describe("len", () => {
  const l = misc.len;

  it("counts the number of keys of an object", () => {
    expect(l({})).toBe(0);
    expect(l([])).toBe(0);
    expect(l({ a: 5 })).toBe(1);
    expect(l({ x: 1, y: [1, 2, 3], z: { a: 1, b: 2 } })).toBe(3);
  });
});

describe("keys", () => {
  const k = misc.keys;

  it("correctly returns the keys of an object", () => {
    expect(k({ a: 5, xyz: "10" }).sort()).toEqual(["a", "xyz"].sort());
    expect(k({ xyz: "10", a: 5 }).sort()).toEqual(["xyz", "a"].sort());
  });

  it("doesn't choke on empty objects", () => {
    expect(k([])).toEqual([]);
    expect(k({})).toEqual([]);
  });
});

describe("has_key", () => {
  const k = misc.has_key;
  const obj = { a: 1, b: "123", c: null, d: undefined };

  it("tests existence", () => {
    expect(k(obj, "a")).toBe(true);
    expect(k(obj, "z")).toBe(false);
  });

  it("also works for null/undefined keys", () => {
    expect(k(obj, "c")).toBe(true);
    expect(k(obj, "d")).toBe(true);
  });
});

describe("min/max of array", () => {
  const a2 = ["f", "bar", "batz"];
  const a3 = [6, -3, 7, 3, -99, 4, 9, 9];

  it("minimum works", () => {
    expect(misc.min(a3)).toBe(-99);
  });

  it("maximum works", () => {
    expect(misc.max(a3)).toBe(9);
  });

  it("doesn't work for strings", () => {
    expect(misc.max(a2)).toBe("f");
    expect(misc.min(a2)).toBe("bar");
  });
});

describe("copy flavours:", () => {
  const mk_object = () => {
    const o1 = {};
    const o2 = { ref: o1 };
    const o = { a: o1, b: [o1, o2], c: o2 };
    return [o, o1];
  };

  describe("copy", () => {
    const c = misc.copy;

    it("creates a shallow copy of a map", () => {
      const [o, o1] = mk_object();
      const co: any = c(o);
      expect(co).toHaveProperty("a");
      expect(co).toHaveProperty("b");
      expect(co).toHaveProperty("c");
      expect(co.a).toBe(o1);
      expect(co.b[0]).toBe(o1);
      expect(co.c.ref).toBe(o1);
    });

    it("copies a string", () => {
      expect(c("foobar")).toBe("foobar");
    });
  });

  describe("copy_without", () => {
    it("creates a shallow copy of a map but without some keys", () => {
      const [o, o1] = mk_object();
      const co: any = misc.copy_without(o, "b");
      expect(co).toHaveProperty("a");
      expect(co).toHaveProperty("c");
      expect(co).not.toHaveProperty("b");
      expect(co.a).toBe(o1);
      expect(co.c.ref).toBe(o1);
    });

    it("also works for an array of filtered keys", () => {
      const [o] = mk_object();
      const co: any = misc.copy_without(o, ["a", "c"]);
      expect(co).toHaveProperty("b");
      expect(co).not.toHaveProperty("a");
      expect(co).not.toHaveProperty("c");
    });

    it("and doesn't throw for unknown keys", () => {
      const [o] = mk_object();
      expect(() => misc.copy_without(o, "d")).not.toThrow();
    });
  });

  describe("copy_with", () => {
    it("creates a shallow copy of a map but only with some keys", () => {
      const [o] = mk_object();
      const co: any = misc.copy_with(o, "a");
      expect(co).toHaveProperty("a");
      expect(co).not.toHaveProperty("b");
      expect(co).not.toHaveProperty("c");
    });

    it("also works for an array of included keys", () => {
      const [o, o1] = mk_object();
      const co: any = misc.copy_with(o, ["a", "c"]);
      expect(co).toHaveProperty("a");
      expect(co).toHaveProperty("c");
      expect(co).not.toHaveProperty("b");
      expect(co.a).toBe(o1);
      expect(co.c.ref).toBe(o1);
    });

    it("and does not throw for unknown keys", () => {
      const [o] = mk_object();
      expect(() => misc.copy_with(o, "d")).not.toThrow();
    });
  });

  describe("deep_copy", () => {
    it("copies nested objects, too", () => {
      const [o, o1] = mk_object();
      const co: any = misc.deep_copy(o);
      expect(co).toHaveProperty("a");
      expect(co).toHaveProperty("b");
      expect(co).toHaveProperty("c");
      expect(co.a).not.toBe(o1);
      expect(co.b[0]).not.toBe(o1);
      expect(co.c.ref).not.toBe(o1);
      expect(co.a).toEqual(o1);
      expect(co.b[0]).toEqual(o1);
      expect(co.c.ref).toEqual(o1);
    });

    it("handles RegExp and Date", () => {
      const d = new Date(2015, 1, 1);
      const r = new RegExp("x", "gim");
      const o = [1, 2, { ref: [d, r] }];
      const co: any = misc.deep_copy(o);
      expect(co[2].ref[0]).toBeInstanceOf(Date);
      expect(co[2].ref[1]).toBeInstanceOf(RegExp);
      expect(co[2].ref[0]).not.toBe(d);
      expect(co[2].ref[1]).not.toBe(r);
      expect(co[2].ref[0]).toEqual(d);
      expect(co[2].ref[1]).toEqual(r);
    });
  });
});

describe("normalized_path_join", () => {
  const pj = misc.normalized_path_join;

  it("Leaves single argument joins untouched", () => {
    expect(pj("lonely")).toBe("lonely");
  });

  it("Does nothing with empty strings", () => {
    expect(pj("", "thing")).toBe("thing");
  });

  it("Ignores undefined parts", () => {
    expect(pj(undefined, undefined, "thing")).toBe("thing");
  });

  it("Does not skip previous upon an absolute path", () => {
    expect(pj("not-skipped!", "/", "thing")).toBe("not-skipped!/thing");
  });

  it("Shrinks multiple /'s into one / if found anywhere", () => {
    expect(pj("//", "thing")).toBe("/thing");
    expect(pj("a//", "//", "//thing")).toBe("a/thing");
    expect(pj("slashes////inside")).toBe("slashes/inside");
  });

  it("Ignores empty strings in the middle", () => {
    expect(pj("a", "", "thing")).toBe("a/thing");
  });

  it("Allows generating absolute paths using a leading /", () => {
    expect(pj("/", "etc", "stuff", "file.name")).toBe("/etc/stuff/file.name");
  });

  it("Allows generating a folder path using a trailing /", () => {
    expect(pj("/", "etc", "stuff", "folder/")).toBe("/etc/stuff/folder/");
    expect(pj("/", "etc", "stuff", "folder", "/")).toBe("/etc/stuff/folder/");
  });
});

describe("path_split", () => {
  const ps = misc.path_split;

  it("returns {head:..., tail:...} where tail is everything after the final slash", () => {
    expect(ps("/")).toEqual({ head: "", tail: "" });
    expect(ps("/HOME/USER")).toEqual({ head: "/HOME", tail: "USER" });
    expect(ps("foobar")).toEqual({ head: "", tail: "foobar" });
    expect(ps("/home/user/file.ext")).toEqual({
      head: "/home/user",
      tail: "file.ext",
    });
  });
});

describe("meta_file", () => {
  const mf = misc.meta_file;

  it("constructs a metafile to a given file", () => {
    expect(mf("foo", "history")).toBe(".foo.sage-history");
    expect(mf("/", "batz")).toBe("..sage-batz");
    expect(mf("/home/user/file.ext", "chat")).toBe(
      "/home/user/.file.ext.sage-chat",
    );
  });
});

describe("trunc", () => {
  const t = misc.trunc;
  const input = "abcdefghijk";

  it("shortens a string", () => {
    const exp = "abcdefg…";
    expect(t(input, 8)).toBe(exp);
  });

  it("raises an error when requested length below 1", () => {
    expect(t(input, 1)).toBe("…");
    expect(() => t(input, 0)).toThrow(/must be >= 1/);
  });

  it("defaults to length 1024", () => {
    const long = "x".repeat(10000);
    expect(t(long)).toEndWith("…");
    expect(t(long)).toHaveLength(1024);
  });

  it("handles empty strings", () => {
    expect(t("")).toBe("");
  });

  it("handles missing argument", () => {
    expect(t()).toBeUndefined();
  });
});

describe("trunc_left", () => {
  const tl = misc.trunc_left;
  const input = "abcdefghijk";

  it("shortens a string from the left", () => {
    const exp = "…efghijk";
    expect(tl(input, 8)).toBe(exp);
  });

  it("raises an error when requested length less than 1", () => {
    expect(tl(input, 1)).toBe("…");
    expect(() => tl(input, 0)).toThrow(/must be >= 1/);
  });

  it("defaults to length 1024", () => {
    const long = "x".repeat(10000);
    expect(tl(long)).toStartWith("…");
    expect(tl(long)).toHaveLength(1024);
  });

  it("handles empty strings", () => {
    expect(tl("")).toBe("");
  });

  it("handles missing argument", () => {
    expect(tl()).toBeUndefined();
  });
});

describe("trunc_middle", () => {
  const tl = misc.trunc_middle;
  const input = "abcdefghijk";

  it("shortens a string in middle (even)", () => {
    const exp = "abc…hijk";
    expect(tl(input, 8)).toBe(exp);
  });

  it("shortens a string in middle (odd)", () => {
    const exp = "abc…ijk";
    expect(tl(input, 7)).toBe(exp);
  });

  it("raises an error when requested length less than 1", () => {
    expect(tl(input, 1)).toBe("…");
    expect(() => tl(input, 0)).toThrow(/must be >= 1/);
  });
});

describe("lower_email_address", () => {
  const lea = misc.lower_email_address;

  it("converts email addresses to lower case", () => {
    expect(lea("FOO@BAR.COM")).toBe("foo@bar.com");
  });

  it("does work fine with objects", () => {
    expect(lea({ foo: "bar" })).toBe('{"foo":"bar"}');
  });
});

describe("parse_user_search", () => {
  const pus = misc.parse_user_search;

  it("reads in a name, converts to lowercase tokens", () => {
    const exp = { email_queries: [], string_queries: [["john", "doe"]] };
    expect(pus("John Doe")).toEqual(exp);
  });

  it("reads in a comma separated list of usernames", () => {
    const exp = {
      email_queries: [],
      string_queries: [
        ["j", "d"],
        ["h", "s", "y"],
      ],
    };
    expect(pus("J D, H S Y")).toEqual(exp);
  });

  it("reads in a angle bracket wrapped email addresses", () => {
    const exp = { email_queries: ["foo+bar@baz.com"], string_queries: [] };
    expect(pus("<foo+bar@baz.com>")).toEqual(exp);
  });

  it("reads in email addresses", () => {
    const exp = { email_queries: ["foo+bar@baz.com"], string_queries: [] };
    expect(pus("foo+bar@baz.com")).toEqual(exp);
  });

  it("also handles mixed queries and spaces", () => {
    const exp = {
      email_queries: ["foo+bar@baz.com", "xyz@mail.com"],
      string_queries: [["john", "doe"]],
    };
    expect(pus("   foo+bar@baz.com   , John   Doe  ; <xyz@mail.com>")).toEqual(
      exp,
    );
  });

  it("works with line breaks, too", () => {
    const exp = {
      email_queries: ["foo@bar.com", "baz+123@cocalc.com", "jd@cocalc.com"],
      string_queries: [
        ["john", "doe"],
        ["dr.", "foo", "bar", "baz"],
      ],
    };
    const query = `
                foo@bar.com
                baz+123@cocalc.com
                John Doe
                Dr. Foo Bar BAZ
                Jane Dae <jd@cocalc.com>
                `;
    expect(pus(query)).toEqual(exp);
  });
});

describe("delete_trailing_whitespace", () => {
  const dtw = misc.delete_trailing_whitespace;

  it("removes whitespace in a string", () => {
    expect(dtw("     ]   łæđ}²đµ·    ")).toBe("     ]   łæđ}²đµ·");
    expect(dtw("   bar     ")).toBe("   bar");
    expect(dtw("batz  ")).toBe("batz");
    expect(dtw("")).toBe("");
  });
});

describe("filename_extension", () => {
  const fe = misc.filename_extension;

  it("properly returns the remainder of a filename", () => {
    expect(fe("abc.def.ghi")).toBe("ghi");
    expect(fe("a/b/c/foo.jpg")).toBe("jpg");
    expect(fe("a/b/c/foo.ABCXYZ")).toBe("ABCXYZ");
  });

  it("and an empty string if there is no extension", () => {
    expect(fe("uvw")).toHaveLength(0);
    expect(fe("uvw")).toBe("");
    expect(fe("a/b/c/ABCXYZ")).toBe("");
  });

  it("does not get confused by dots in the path", () => {
    expect(fe("foo.bar/baz")).toBe("");
    expect(fe("foo.bar/baz.ext")).toBe("ext");
  });
});

describe("retry_until_success", () => {
  let log: jest.Mock;
  let fstub: jest.Mock;

  beforeEach(() => {
    log = jest.fn();
    fstub = jest.fn();
  });

  it("calls the function and callback exactly once", async () => {
    fstub.mockImplementationOnce((cb: (err?: any) => void) =>
      setTimeout(() => cb(), 0),
    );
    await new Promise<void>((resolve) => {
      misc.retry_until_success({
        f: fstub,
        cb: () => {
          expect(log).toHaveBeenCalledTimes(2);
          resolve();
        },
        start_delay: 1,
        log,
      });
    });
    expect(fstub).toHaveBeenCalledTimes(1);
  });

  it("tests if calling the cb with an error is handled correctly", async () => {
    fstub
      .mockImplementationOnce((cb: (err?: any) => void) =>
        setTimeout(() => cb("just a test"), 0),
      )
      .mockImplementationOnce((cb: (err?: any) => void) =>
        setTimeout(() => cb(), 0),
      );

    await new Promise<void>((resolve) => {
      misc.retry_until_success({
        f: fstub,
        cb: () => {
          expect(fstub).toHaveBeenCalledTimes(2);
          expect(log.mock.calls[1][0]).toMatch(/err="just a test"/);
          expect(log.mock.calls[2][0]).toMatch(/try 2/);
          resolve();
        },
        start_delay: 1,
        log,
      });
    });
  });

  it("fails after `max_retries`", async () => {
    fstub.mockImplementation((cb: (err?: any) => void) =>
      setTimeout(() => cb("just a test"), 0),
    );

    await new Promise<void>((resolve) => {
      misc.retry_until_success({
        f: fstub,
        cb: () => {
          expect(fstub).toHaveBeenCalledTimes(5);
          expect(log).toHaveBeenCalledTimes(10);
          expect(log.mock.calls[1][0]).toMatch(/err="just a test"/);
          expect(log.mock.calls[8][0]).toMatch(/try 5\/5/);
          resolve();
        },
        start_delay: 1,
        log,
        max_tries: 5,
      });
    });
  });
});

describe("StringCharMapping", () => {
  let scm: InstanceType<typeof misc.StringCharMapping>;

  beforeEach(() => {
    scm = new misc.StringCharMapping();
  });

  it("the constructor's initial state", () => {
    expect(scm._to_char).toEqual({});
    expect(scm._next_char).toBe("B");
  });

  it("works with calling to_string", () => {
    expect(scm.to_string(["A", "K"])).toBe("BC");
  });
});

describe("PROJECT_GROUPS", () => {
  it("checks that there has not been an accidental edit of this array", () => {
    const act = misc.PROJECT_GROUPS;
    const exp = [
      "owner",
      "collaborator",
      "viewer",
      "invited_collaborator",
      "invited_viewer",
    ];
    expect(act).toEqual(exp);
  });
});

describe("make_valid_name", () => {
  it("removes non-alphanumeric chars to create an identifier fit for using in an URL", () => {
    const s =
      "make_valid_name øf th1s \nſŧ¶→”ŋ (without) chöcking on spe\tial ¢ħæ¶æ¢ŧ€¶ſ";
    const exp =
      "make_valid_name__f_th1s__________without__ch_cking_on_spe_ial___________";
    const act = misc.make_valid_name(s);
    expect(act).toBe(exp);
    expect(act).toHaveLength(exp.length);
  });
});

describe("parse_bup_timestamp", () => {
  it("reads e.g. 2014-01-02-031508 and returns a date object", () => {
    const input = "2014-01-02-031508";
    const act = misc.parse_bup_timestamp(input);
    expect(act).toBeInstanceOf(Date);
    const exp = new Date("2014-01-02T03:15:08.000Z");
    expect(act).toEqual(exp);
  });
});

describe("hash_string", () => {
  const hs = misc.hash_string;

  it("returns 0 for an empty string", () => {
    expect(hs("")).toBe(0);
  });

  it("deterministically hashes a string", () => {
    const s1 = "foobarblablablaöß\næ\tx";
    const h1 = hs(s1);
    expect(h1).toBe(hs(s1));
    for (let i = 2; i < s1.length; i++) {
      expect(hs(s1.substring(i))).not.toBe(h1);
    }
  });
});

describe("parse_hashtags", () => {
  const ph = misc.parse_hashtags;

  it("returns empty array for nothing", () => {
    expect(ph()).toEqual([]);
  });

  it("returns empty when no valid hashtags", () => {
    expect(ph("no hashtags here!")).toHaveLength(0);
  });

  it("returns empty when empty string", () => {
    expect(ph("")).toHaveLength(0);
  });

  it("returns correctly for one hashtag", () => {
    expect(ph("one #hashtag here")).toEqual([[4, 12]]);
  });

  it("works for many hashtags in one string", () => {
    expect(ph("#many #hashtags here #should #work")).toEqual([
      [0, 5],
      [6, 15],
      [21, 28],
      [29, 34],
    ]);
  });

  it("makes sure hash followed by noncharacter is not a hashtag", () => {
    expect(ph("#hashtag # not hashtag ##")).toEqual([[0, 8]]);
  });
});

describe("path_is_in_public_paths", () => {
  const p = misc.path_is_in_public_paths;

  it("returns false for a path with no public paths", () => {
    expect(p("path", [])).toBe(false);
  });

  it("returns false if path is undefined and there are no public paths -- basically avoid possible hack", () => {
    expect(p(null, [])).toBe(false);
  });

  it("returns false if path is undefined and there is a public path -- basically avoid possible hack", () => {
    expect(p(null, ["/public/path"])).toBe(false);
  });

  it("returns true if the entire project is public", () => {
    expect(p("path", [""])).toBe(true);
  });

  it("returns true if the path matches something in the list", () => {
    expect(p("path", ["path_name", "path"])).toBe(true);
  });

  it("returns true if the path is within a public path", () => {
    expect(p("path/name", ["path_name", "path"])).toBe(true);
  });

  it("returns true if path ends with .zip and is within a public path", () => {
    expect(p("path/name.zip", ["path_name", "path"])).toBe(true);
  });

  it("handles path.zip correctly if it is not in the path", () => {
    expect(p("foo/bar.zip", ["foo/baz"])).toBe(false);
  });

  it("returns false if the path is not in the public paths", () => {
    expect(p("path", ["path_name", "path/name"])).toBe(false);
  });

  it("doesn't allow relative path trickery", () => {
    expect(p("../foo", ["foo"])).toBe(false);
  });
});

describe("timestamp_cmp", () => {
  const tcmp = misc.timestamp_cmp;
  const a = { timestamp: new Date("2015-01-01") };
  const b = { timestamp: new Date("2015-01-02") };

  it("correctly compares timestamps", () => {
    expect(tcmp(a, b)).toBe(1);
    expect(tcmp(b, a)).toBe(-1);
    expect(Math.abs(tcmp(a, a))).toBe(0);
  });

  it("handles missing timestamps gracefully", () => {
    expect(tcmp(a, {})).toBe(-1);
    expect(tcmp({}, b)).toBe(1);
  });
});

describe("encode_path", () => {
  const e = misc.encode_path;

  it("escapes # and ?", () => {
    expect(e("file.html?param#anchor")).toBe("file.html%3Fparam%23anchor");
  });

  it("doesn't escape other path characters", () => {
    expect(e("a/b,&$:@=+")).toBe("a/b,&$:@=+");
  });
});

describe("capitalize", () => {
  const c = misc.capitalize;

  it("capitalizes the first letter of a word", () => {
    expect(c("foo")).toBe("Foo");
  });

  it("works with non ascii characters", () => {
    expect(c("å∫ç")).toBe("Å∫ç");
  });
});

describe("replace_all", () => {
  const ra = misc.replace_all;

  it("replaces all occurrences of a string in a string", () => {
    expect(ra("foobarbaz", "bar", "-")).toBe("foo-baz");
    expect(ra("x y z", " ", "")).toBe("xyz");
    expect(ra(ra("foo\nbar\tbaz", "\n", ""), "\t", "")).toBe("foobarbaz");
    expect(ra("ſþ¨€¢→æł ¢ħæ¶æ¢ŧ€¶ſ", "æ", "a")).toBe("ſþ¨€¢→ał ¢ħa¶a¢ŧ€¶ſ");
  });
});

describe("date_to_snapshot_format", () => {
  const dtsf = misc.date_to_snapshot_format;

  it("correctly converts a number-date to the snapshot format", () => {
    expect(dtsf(1000000000000)).toBe("2001-09-09-014640");
  });

  it("assumes timestamp 0 for no argument", () => {
    expect(dtsf()).toBe("1970-01-01-000000");
  });

  it("works correctly for Date instances", () => {
    expect(dtsf(new Date("2015-01-02T03:04:05+0600"))).toBe(
      "2015-01-01-210405",
    );
  });
});

describe("human readable list", () => {
  const thl = misc.to_human_list;

  it("handles small lists", () => {
    expect(thl([])).toBe("");
  });

  it("single value lists", () => {
    expect(thl([1])).toBe("1");
  });

  it("converts longer lists well", () => {
    const arr = ["a", ["foo", "bar"], 99];
    const exp = "a, foo,bar and 99";
    expect(thl(arr)).toBe(exp);
  });
});

describe("peer_grading", () => {
  const peer_grading = misc.peer_grading;

  it("sometimes throws errors", () => {
    expect(() => peer_grading([1, 2, 3], { N: 0 })).toThrow();
    expect(() => peer_grading([1, 2, 3], { N: 1 })).not.toThrow();
    expect(() => peer_grading([1, 2, 3], { N: 2 })).not.toThrow();
    expect(() => peer_grading([1, 2, 3], { N: 3 })).toThrow();
    expect(() => peer_grading([1, 2, 3], { N: 4 })).toThrow();
  });

  it("generates proper peer lists", () => {
    for (let n = 1; n <= 5; n++) {
      for (let s = n + 1; s < 20; s++) {
        const students = Array.from({ length: s }, (_, i) => `S_${i}`);
        const assignment = peer_grading(students, { N: n });

        expect(Object.keys(assignment)).toEqual(students);
        expect(Object.keys(assignment).length).toBe(s);

        for (const [k, v] of Object.entries(assignment)) {
          // Check student not assigned to themselves
          expect(v).not.toContain(k);
          // Check all assignments have N students
          expect(v.length).toBe(n);
          // Check no duplicates in assignments
          expect([...new Set(v)].length).toBe(v.length);
        }

        // Check each student has to grade n times
        for (const s of students) {
          const count = Object.values(assignment).filter((v) =>
            v.includes(s),
          ).length;
          expect(count).toBe(n);
        }
      }
    }
  });
});

describe("sum", () => {
  it("adds up an array", () => {
    expect(misc.sum([1, 2, 3])).toBe(6);
  });

  it("works with empty arrays", () => {
    expect(misc.sum([])).toBe(0);
  });

  it("has an option to set a start", () => {
    expect(misc.sum([-1, 5], { start: -5 })).toBe(-1);
  });
});

describe("map_min limits the values of a by the values in b or by b if b is a number", () => {
  it("map_min == map_limit", () => {
    expect(misc.map_limit).toBe(misc.map_min);
  });

  it("Limits by a map with similar keys", () => {
    const a = { x: 8, y: -1, z: 5 };
    const b = { x: 4.4, y: 2.2 };
    const e = { x: 4.4, y: -1, z: 5 };
    expect(misc.map_limit(a, b)).toEqual(e);
  });

  it("Limits by a number", () => {
    const a = { x: 8, y: -1, z: 5 };
    const b = 0;
    const e = { x: 0, y: -1, z: 0 };
    expect(misc.map_limit(a, b)).toEqual(e);
  });
});

describe("map_max is similar to map_min", () => {
  it("Limits by a map with similar keys", () => {
    const a = { x: 8, y: -1, z: 5 };
    const b = { x: 4.4, y: 2.2 };
    const e = { x: 8, y: 2.2, z: 5 };
    expect(misc.map_max(a, b)).toEqual(e);
  });

  it("Limits by a number", () => {
    const a = { x: 8, y: -1, z: 5 };
    const b = 0;
    const e = { x: 8, y: 0, z: 5 };
    expect(misc.map_max(a, b)).toEqual(e);
  });
});

describe("is_valid_email_address is", () => {
  const valid = misc.is_valid_email_address;

  it("true for test@test.com", () => {
    expect(valid("test@test.com")).toBe(true);
  });

  it("false for blabla", () => {
    expect(valid("blabla")).toBe(false);
  });
});

describe("separate_file_extension", () => {
  const sfe = misc.separate_file_extension;

  it("splits filename.ext accordingly", () => {
    const { name, ext } = sfe("foobar/filename.ext");
    expect(name).toBe("foobar/filename");
    expect(ext).toBe("ext");
  });

  it("ignores missing extensions", () => {
    const { name, ext } = sfe("foo.bar/baz");
    expect(name).toBe("foo.bar/baz");
    expect(ext).toBe("");
  });
});

describe("change_filename_extension", () => {
  const cfe = misc.change_filename_extension;

  it("changes a tex to pdf", () => {
    expect(cfe("filename.tex", "pdf")).toBe("filename.pdf");
    expect(cfe("/bar/baz/foo.png", "gif")).toBe("/bar/baz/foo.gif");
  });

  it("deals with missing extensions", () => {
    expect(cfe("filename", "tex")).toBe("filename.tex");
  });
});

describe("path_to_tab", () => {
  it("appends editor- to the front of the string", () => {
    expect(misc.path_to_tab("str")).toBe("editor-str");
  });
});

describe("tab_to_path", () => {
  it("returns undefined if given undefined", () => {
    expect(misc.tab_to_path()).toBeUndefined();
  });

  it("returns undefined if given a non-editor name", () => {
    expect(misc.tab_to_path("non-editor")).toBeUndefined();
  });

  it("returns the string truncating editor-", () => {
    expect(misc.tab_to_path("editor-path/name.thing")).toBe("path/name.thing");
  });
});

describe("suggest_duplicate_filename", () => {
  const dup = misc.suggest_duplicate_filename;

  it("works with numbers", () => {
    expect(dup("filename-1.test")).toBe("filename-2.test");
    expect(dup("filename-99.test")).toBe("filename-100.test");
    expect(dup("filename_001.test")).toBe("filename_2.test");
    expect(dup("filename_99.test")).toBe("filename_100.test");
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

describe("top_sort", () => {
  const DAG = {
    node1: [],
    node0: [],
    node2: ["node1"],
    node3: ["node1", "node2"],
  };
  const old_DAG_string = JSON.stringify(DAG);

  it("Returns a valid ordering", () => {
    const result = misc.top_sort(DAG);
    expect([
      ["node1", "node0", "node2", "node3"],
      ["node0", "node1", "node2", "node3"],
    ]).toContainEqual(result);
  });

  it("Omits graph sources when omit_sources:true", () => {
    expect(misc.top_sort(DAG, { omit_sources: true })).toEqual([
      "node2",
      "node3",
    ]);
  });

  it("Leaves the original DAG the same afterwards", () => {
    misc.top_sort(DAG);
    expect(JSON.stringify(DAG)).toBe(old_DAG_string);
  });

  const DAG2 = {
    node0: [],
    node1: ["node2"],
    node2: ["node1"],
  };

  it("Detects cycles and throws an error", () => {
    expect(() => misc.top_sort(DAG2)).toThrow(
      "Store has a cycle in its computed values",
    );
  });

  const DAG3 = {
    node1: ["node2"],
    node2: ["node1"],
  };

  it("Detects a lack of sources and throws an error", () => {
    expect(() => misc.top_sort(DAG3)).toThrow("No sources were detected");
  });

  const DAG4 = {
    node1: ["node0"],
    node2: ["node0", "node1"],
  };

  it("Works with implicit sources", () => {
    expect(misc.top_sort(DAG4)).toEqual(["node0", "node1", "node2"]);
  });
});

describe("create_dependency_graph", () => {
  const store_def = {
    first_name: () => "Joe",
    last_name: () => "Smith",
    full_name: (first_name: string, last_name: string) =>
      `${first_name} ${last_name}`,
    short_name: (full_name: string) => full_name.slice(0, 5),
  };
  store_def.full_name.dependency_names = ["first_name", "last_name"];
  store_def.short_name.dependency_names = ["full_name"];

  const DAG_string = JSON.stringify({
    first_name: [],
    last_name: [],
    full_name: ["first_name", "last_name"],
    short_name: ["full_name"],
  });

  it("Creates a DAG with the right structure", () => {
    expect(JSON.stringify(misc.create_dependency_graph(store_def))).toBe(
      DAG_string,
    );
  });
});

describe("test the date parser", () => {
  it("a date with a zone", () => {
    expect(misc.date_parser(undefined, "2016-12-12T02:12:03.239Z") - 0).toBe(
      1481508723239,
    );
  });

  it("a date without a zone (should default to utc)", () => {
    expect(misc.date_parser(undefined, "2016-12-12T02:12:03.239") - 0).toBe(
      1481508723239,
    );
  });

  it("a date without a zone and more digits (should default to utc)", () => {
    expect(misc.date_parser(undefined, "2016-12-12T02:12:03.239417") - 0).toBe(
      1481508723239,
    );
  });

  it("a non-date does nothing", () => {
    expect(misc.date_parser(undefined, "cocalc")).toBe("cocalc");
  });
});

describe("test ISO_to_Date", () => {
  it("a date with a zone", () => {
    expect(misc.ISO_to_Date("2016-12-12T02:12:03.239Z") - 0).toBe(
      1481508723239,
    );
  });

  it("a date without a zone (should default to utc)", () => {
    expect(misc.ISO_to_Date("2016-12-12T02:12:03.239") - 0).toBe(1481508723239);
  });

  it("a date without a zone and more digits (should default to utc)", () => {
    expect(misc.ISO_to_Date("2016-12-12T02:12:03.239417") - 0).toBe(
      1481508723239,
    );
  });

  it("a non-date does NaN", () => {
    expect(isNaN(misc.ISO_to_Date("cocalc"))).toBe(true);
  });
});

describe("test converting to and from JSON for sending over a socket", () => {
  it("converts object involving various timestamps", () => {
    const obj = {
      first: { now: new Date() },
      second: { a: new Date(0), b: "2016-12-12T02:12:03.239" },
    };
    expect(misc.from_json_socket(misc.to_json_socket(obj))).toEqual(obj);
  });
});

describe("test closest kernel matching method", () => {
  const octave = immutable.Map({
    name: "octave",
    display_name: "Octave",
    language: "octave",
  });
  const python2 = immutable.Map({
    name: "python2",
    display_name: "Python 2",
    language: "python",
  });
  const python3 = immutable.Map({
    name: "python3",
    display_name: "Python 3",
    language: "python",
  });
  const sage8_2 = immutable.Map({
    name: "sage8.2",
    display_name: "Sagemath 8.2",
    language: "python",
  });
  const sage8_10 = immutable.Map({
    name: "sage8.10",
    display_name: "Sagemath 8.10",
    language: "python",
  });
  const ir = immutable.Map({
    name: "ir",
    display_name: "R (R-Project)",
    language: "r",
  });
  const ir_old = immutable.Map({
    name: "ir-old",
    display_name: "R (old)",
    language: "r",
    metadata: { cocalc: { priority: -10 } },
  });
  const kernels = immutable.List([
    octave,
    python3,
    python3,
    sage8_2,
    sage8_10,
    ir,
    ir_old,
  ]);

  it("thinks python8 should be python3", () => {
    expect(misc.closest_kernel_match("python8", kernels)).toBe(python3);
  });

  it('replaces "matlab" with "octave"', () => {
    expect(misc.closest_kernel_match("matlab", kernels)).toBe(octave);
  });

  it("suggests sage8.10 over sage8.2", () => {
    expect(misc.closest_kernel_match("sage8", kernels)).toBe(sage8_10);
  });

  it("suggests R over ir35", () => {
    expect(misc.closest_kernel_match("ir35", kernels)).toBe(ir);
  });

  it("suggests R over ir-35", () => {
    expect(misc.closest_kernel_match("ir-35", kernels)).toBe(ir);
  });
});
