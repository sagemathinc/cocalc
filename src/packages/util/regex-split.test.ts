/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { regex_split } from "./regex-split";

describe("regex_split", () => {
  test("basic split on space", () => {
    expect(regex_split("a b c d", / /)).toEqual(["a", "b", "c", "d"]);
  });

  test("split with limit", () => {
    expect(regex_split("a b c d", / /, 2)).toEqual(["a", "b"]);
  });

  test("split with capturing groups includes backreferences", () => {
    expect(regex_split("..word1 word2..", /([a-z]+)(\d+)/i)).toEqual([
      "..",
      "word",
      "1",
      " ",
      "word",
      "2",
      "..",
    ]);
  });

  test("empty string returns array with empty string", () => {
    expect(regex_split("", /,/)).toEqual([""]);
  });

  test("no match returns original string in array", () => {
    expect(regex_split("hello", /,/)).toEqual(["hello"]);
  });

  test("consecutive separators produce empty strings", () => {
    expect(regex_split("a,,b", /,/)).toEqual(["a", "", "b"]);
  });

  test("separator at start", () => {
    expect(regex_split(",a,b", /,/)).toEqual(["", "a", "b"]);
  });

  test("separator at end", () => {
    expect(regex_split("a,b,", /,/)).toEqual(["a", "b", ""]);
  });

  test("case-insensitive flag is preserved", () => {
    expect(regex_split("aXbXc", /x/i)).toEqual(["a", "b", "c"]);
  });

  test("multiline flag is preserved", () => {
    const result = regex_split("a\nb\nc", /^/m);
    expect(result).toEqual(["a\n", "b\n", "c"]);
  });

  test("limit of 0 returns empty array", () => {
    expect(regex_split("a,b,c", /,/, 0)).toEqual([]);
  });

  test("limit of 1 returns first part", () => {
    expect(regex_split("a,b,c", /,/, 1)).toEqual(["a"]);
  });

  test("limit larger than splits returns all parts", () => {
    expect(regex_split("a,b", /,/, 100)).toEqual(["a", "b"]);
  });

  test("split on alternation (MATHSPLIT-like pattern)", () => {
    // Mimics the MathJax MATHSPLIT pattern for $ delimiters
    const MATHSPLIT = /(\$\$?)/;
    expect(regex_split("text $math$ more", MATHSPLIT)).toEqual([
      "text ",
      "$",
      "math",
      "$",
      " more",
    ]);
  });

  test("split with \\begin/\\end pattern", () => {
    const MATHSPLIT = /(\$\$?|\\(?:begin|end)\{[a-z]*\*?\})/i;
    const result = regex_split(
      "before\\begin{align}x=1\\end{align}after",
      MATHSPLIT,
    );
    expect(result).toEqual([
      "before",
      "\\begin{align}",
      "x=1",
      "\\end{align}",
      "after",
    ]);
  });
});
