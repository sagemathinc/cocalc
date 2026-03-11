/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  fenceCell,
  truncate,
  parseToolBlocks,
  buildContextLabel,
  resolveIndex,
} from "./notebook-agent-utils";

/* ------------------------------------------------------------------ */
/*  fenceCell                                                          */
/* ------------------------------------------------------------------ */

describe("fenceCell", () => {
  test("code cell uses language", () => {
    const result = fenceCell("print('hi')", "code", "python");
    expect(result).toContain("```python");
    expect(result).toContain("print('hi')");
  });

  test("markdown cell uses 'markdown'", () => {
    const result = fenceCell("# Title", "markdown", "python");
    expect(result).toContain("```markdown");
  });

  test("handles content with backticks", () => {
    const result = fenceCell("```\ncode\n```", "code", "python");
    // backtickSequence should produce 4+ backticks
    expect(result.startsWith("````")).toBe(true);
  });

  test("raw cell uses markdown tag", () => {
    const result = fenceCell("raw text", "raw", "python");
    expect(result).toContain("```markdown");
  });
});

/* ------------------------------------------------------------------ */
/*  truncate                                                           */
/* ------------------------------------------------------------------ */

describe("truncate", () => {
  test("short strings unchanged", () => {
    expect(truncate("hello", 100)).toBe("hello");
  });

  test("long strings truncated with message", () => {
    const long = "x".repeat(200);
    const result = truncate(long, 100);
    expect(result.length).toBeLessThan(200);
    expect(result).toContain("truncated");
    expect(result).toContain("200 chars total");
  });

  test("exact length unchanged", () => {
    const exact = "x".repeat(100);
    expect(truncate(exact, 100)).toBe(exact);
  });
});

/* ------------------------------------------------------------------ */
/*  parseToolBlocks                                                    */
/* ------------------------------------------------------------------ */

describe("parseToolBlocks", () => {
  test("parses single tool block", () => {
    const text =
      'Some text\n```tool\n{"name": "cell_count", "args": {}}\n```\nMore text';
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("cell_count");
  });

  test("parses multiple tool blocks", () => {
    const text =
      '```tool\n{"name": "get_cell", "args": {"index": 1}}\n```\n```tool\n{"name": "run_cell", "args": {"index": 2}}\n```';
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].name).toBe("get_cell");
    expect(blocks[1].name).toBe("run_cell");
  });

  test("skips malformed JSON", () => {
    const text = "```tool\n{not valid json}\n```";
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(0);
  });

  test("returns empty for no tool blocks", () => {
    const blocks = parseToolBlocks("just regular text");
    expect(blocks).toHaveLength(0);
  });

  test("defaults args to empty object", () => {
    const text = '```tool\n{"name": "cell_count"}\n```';
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].args).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/*  buildContextLabel                                                  */
/* ------------------------------------------------------------------ */

describe("buildContextLabel", () => {
  const base = {
    totalCells: 10,
    kernelName: "Python 3",
    language: "python",
  };

  test("no cell focused", () => {
    expect(buildContextLabel(base)).toBe("");
  });

  test("cell focused, no cursor", () => {
    expect(
      buildContextLabel({ ...base, cellIndex: 5, cellType: "code" }),
    ).toBe("Cell #5 (code)");
  });

  test("cursor at line", () => {
    expect(
      buildContextLabel({
        ...base,
        cellIndex: 3,
        cellType: "code",
        cursorLine: 11,
      }),
    ).toBe("Cell #3 (code), line 12");
  });

  test("single-line selection", () => {
    expect(
      buildContextLabel({
        ...base,
        cellIndex: 2,
        selection: "x = 42",
        selectionRange: { fromLine: 4, toLine: 4 },
      }),
    ).toBe('Cell #2, line 5: "x = 42"');
  });

  test("multi-line selection", () => {
    expect(
      buildContextLabel({
        ...base,
        cellIndex: 2,
        selection: "x = 42\ny = 43",
        selectionRange: { fromLine: 4, toLine: 5 },
      }),
    ).toBe("Cell #2, lines 5\u20136 selected");
  });

  test("multi-cell selection", () => {
    expect(
      buildContextLabel({
        ...base,
        cellIndex: 3,
        selectedCellIndices: [3, 4, 5, 6, 7],
      }),
    ).toBe("Cells #3\u20137 selected");
  });

  test("long selection text truncated", () => {
    const longSel = "a".repeat(100);
    const label = buildContextLabel({
      ...base,
      cellIndex: 1,
      selection: longSel,
      selectionRange: { fromLine: 0, toLine: 0 },
    });
    expect(label.length).toBeLessThan(100);
    expect(label).toContain("...");
  });

  test("markdown cell type in label", () => {
    expect(
      buildContextLabel({
        ...base,
        cellIndex: 1,
        cellType: "markdown",
      }),
    ).toBe("Cell #1 (markdown)");
  });
});

/* ------------------------------------------------------------------ */
/*  resolveIndex                                                       */
/* ------------------------------------------------------------------ */

describe("resolveIndex", () => {
  const cellList = ["id-a", "id-b", "id-c"];

  test("valid 1-based index", () => {
    const res = resolveIndex(2, cellList);
    expect(res).toEqual({ idx: 1, cellId: "id-b" });
  });

  test("first cell", () => {
    const res = resolveIndex(1, cellList);
    expect(res).toEqual({ idx: 0, cellId: "id-a" });
  });

  test("last cell", () => {
    const res = resolveIndex(3, cellList);
    expect(res).toEqual({ idx: 2, cellId: "id-c" });
  });

  test("index 0 is out of range", () => {
    const res = resolveIndex(0, cellList);
    expect("error" in res).toBe(true);
  });

  test("index beyond length is out of range", () => {
    const res = resolveIndex(4, cellList);
    expect("error" in res).toBe(true);
  });

  test("negative index is out of range", () => {
    const res = resolveIndex(-1, cellList);
    expect("error" in res).toBe(true);
  });
});
