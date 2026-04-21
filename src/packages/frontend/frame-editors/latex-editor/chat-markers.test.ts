/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  BOOKMARK_PREFIX,
  CHAT_PREFIX,
  buildBlockInsertion,
  buildBookmarkLine,
  buildInlineInsertion,
  buildMarkerLine,
  findCommentStart,
  generateMarkerHash,
  lineHasTexContent,
  scanBlankLines,
  scanBookmarks,
  scanMarkers,
} from "./chat-markers";

describe("findCommentStart", () => {
  it("returns -1 when there is no percent sign", () => {
    expect(findCommentStart("plain tex content")).toBe(-1);
  });

  it("returns the column of a single unescaped percent", () => {
    expect(findCommentStart("abc % chat")).toBe(4);
  });

  it("returns the LAST unescaped percent when there are several", () => {
    expect(findCommentStart("a % first % second")).toBe(10);
  });

  it("skips a percent escaped by a single backslash", () => {
    expect(findCommentStart("\\% escaped")).toBe(-1);
  });

  it("honors double-backslash (escaped backslash) before the percent", () => {
    // `\\%` is an escaped backslash followed by an unescaped `%`
    expect(findCommentStart("\\\\% real comment")).toBe(2);
  });

  it("returns the rightmost unescaped percent even when an earlier one is escaped", () => {
    const s = "\\% not a comment % yes";
    expect(findCommentStart(s)).toBe(s.lastIndexOf("%"));
  });
});

describe("scanMarkers (chat)", () => {
  it("returns an empty array for empty input", () => {
    expect(scanMarkers("")).toEqual([]);
  });

  it("finds a block-form marker on its own line", () => {
    const result = scanMarkers(`some text\n% ${CHAT_PREFIX}: abc12345\nmore`);
    expect(result).toEqual([{ hash: "abc12345", line: 1, col: 0 }]);
  });

  it("finds an inline marker at the end of a tex line", () => {
    const line = `\\int_0^1 f(x) dx  % ${CHAT_PREFIX}: abc12345`;
    const result = scanMarkers(line);
    expect(result).toEqual([
      { hash: "abc12345", line: 0, col: line.indexOf("%") },
    ]);
  });

  it("tolerates whitespace around the keyword and hash", () => {
    expect(scanMarkers("%   chat:   abc12345  ")).toEqual([
      { hash: "abc12345", line: 0, col: 0 },
    ]);
  });

  it("rejects an empty / malformed body", () => {
    expect(scanMarkers("% chat:")).toEqual([]);
    expect(scanMarkers("% chat: ")).toEqual([]);
  });

  it("rejects a hash shorter than the minimum (3)", () => {
    expect(scanMarkers("% chat: ab")).toEqual([]);
  });

  it("accepts a mnemonic hash with dashes and underscores", () => {
    expect(scanMarkers("% chat: review-sec2_summary")).toEqual([
      { hash: "review-sec2_summary", line: 0, col: 0 },
    ]);
  });

  it("rejects a hash with disallowed characters", () => {
    expect(scanMarkers("% chat: has space")).toEqual([]);
    expect(scanMarkers("% chat: has.dot")).toEqual([]);
  });

  it("rejects a hash longer than the maximum (64)", () => {
    const long = "a".repeat(65);
    expect(scanMarkers(`% chat: ${long}`)).toEqual([]);
  });

  it("rejects an escaped percent (not a comment start)", () => {
    expect(scanMarkers("\\% chat: abc12345")).toEqual([]);
  });

  it("preserves duplicate hashes across multiple lines", () => {
    const text = [
      "% chat: same-hash",
      "prose",
      "% chat: same-hash",
    ].join("\n");
    expect(scanMarkers(text)).toEqual([
      { hash: "same-hash", line: 0, col: 0 },
      { hash: "same-hash", line: 2, col: 0 },
    ]);
  });

  it("ignores an earlier percent when a later one is the marker", () => {
    // The scanner keys on the LAST unescaped `%` of a line, so the
    // comment that "wins" is the trailing one. Here the content before
    // the second `%` (including the first `%`) is just a comment prefix.
    const text = "% not-a-marker % chat: abc12345";
    expect(scanMarkers(text)).toEqual([
      { hash: "abc12345", line: 0, col: text.lastIndexOf("%") },
    ]);
  });

  it("does not match the bookmark keyword", () => {
    expect(scanMarkers("% bookmark: something")).toEqual([]);
  });
});

describe("scanBookmarks", () => {
  it("returns an empty array for empty input", () => {
    expect(scanBookmarks("")).toEqual([]);
  });

  it("accepts free-form text with spaces and punctuation", () => {
    expect(scanBookmarks("% bookmark: See fig. 2 — intro")).toEqual([
      { text: "See fig. 2 — intro", line: 0, col: 0 },
    ]);
  });

  it("finds an inline bookmark at the end of a line", () => {
    const line = "\\section{Intro}  % bookmark: intro";
    expect(scanBookmarks(line)).toEqual([
      { text: "intro", line: 0, col: line.indexOf("%") },
    ]);
  });

  it("rejects an empty body", () => {
    expect(scanBookmarks("% bookmark:")).toEqual([]);
    expect(scanBookmarks("% bookmark: ")).toEqual([]);
  });

  it("preserves duplicate bookmarks", () => {
    const text = ["% bookmark: dup", "stuff", "% bookmark: dup"].join("\n");
    expect(scanBookmarks(text)).toEqual([
      { text: "dup", line: 0, col: 0 },
      { text: "dup", line: 2, col: 0 },
    ]);
  });

  it("does not match the chat keyword", () => {
    expect(scanBookmarks("% chat: abc12345")).toEqual([]);
  });
});

describe("scanBlankLines", () => {
  it("returns indices of empty and whitespace-only lines", () => {
    const text = ["line a", "", "  ", "\t", "line b"].join("\n");
    expect(scanBlankLines(text)).toEqual([1, 2, 3]);
  });
});

describe("lineHasTexContent", () => {
  it("is false for an empty line", () => {
    expect(lineHasTexContent("")).toBe(false);
  });
  it("is false for whitespace-only", () => {
    expect(lineHasTexContent("   \t  ")).toBe(false);
  });
  it("is false for a block-form comment", () => {
    expect(lineHasTexContent("% chat: abc12345")).toBe(false);
    expect(lineHasTexContent("  % just a comment")).toBe(false);
  });
  it("is true when there is tex content before the `%`", () => {
    expect(lineHasTexContent("\\int f  % chat: abc12345")).toBe(true);
  });
  it("is true for tex content without any comment", () => {
    expect(lineHasTexContent("plain text")).toBe(true);
  });
});

describe("generateMarkerHash", () => {
  it("returns a non-empty string in the accepted alphabet", () => {
    for (let i = 0; i < 20; i++) {
      const h = generateMarkerHash();
      expect(h).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(h.length).toBeGreaterThanOrEqual(3);
      expect(h.length).toBeLessThanOrEqual(64);
    }
  });

  it("produces values the scanner can round-trip", () => {
    for (let i = 0; i < 20; i++) {
      const h = generateMarkerHash();
      const scanned = scanMarkers(`% ${CHAT_PREFIX}: ${h}`);
      expect(scanned).toEqual([{ hash: h, line: 0, col: 0 }]);
    }
  });
});

describe("insertion builders", () => {
  it("buildMarkerLine produces the exact block-form chat comment", () => {
    expect(buildMarkerLine("abc12345")).toBe(`% ${CHAT_PREFIX}: abc12345`);
  });

  it("buildInlineInsertion prefixes two spaces", () => {
    expect(buildInlineInsertion("abc12345")).toBe(
      `  % ${CHAT_PREFIX}: abc12345`,
    );
  });

  it("buildBlockInsertion wraps with surrounding newlines", () => {
    expect(buildBlockInsertion("abc12345")).toBe(
      `\n% ${CHAT_PREFIX}: abc12345\n`,
    );
  });

  it("buildBookmarkLine uses the bookmark prefix", () => {
    expect(buildBookmarkLine("my-anchor")).toBe(
      `% ${BOOKMARK_PREFIX}: my-anchor`,
    );
  });

  it("insertion outputs are round-trippable by the scanner", () => {
    const hash = "round-trip-xyz";
    expect(scanMarkers(buildMarkerLine(hash))).toEqual([
      { hash, line: 0, col: 0 },
    ]);
    expect(
      scanBookmarks(buildBookmarkLine("free form with spaces")),
    ).toEqual([{ text: "free form with spaces", line: 0, col: 0 }]);
  });
});
