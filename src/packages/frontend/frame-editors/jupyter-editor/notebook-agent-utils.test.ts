/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  buildPostToolPrompt,
  buildSystemPrompt,
  compactAssistantMessageForHistory,
  compactToolResultForHistory,
  fenceCell,
  getCellContextWindow,
  truncate,
  parseToolBlocks,
  buildContextLabel,
  resolveIndex,
  getFewShotExamples,
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
/*  getCellContextWindow                                              */
/* ------------------------------------------------------------------ */

describe("getCellContextWindow", () => {
  test("returns a line window around the cursor for large cells", () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    const window = getCellContextWindow(content, {
      cursorLine: 49,
      radiusLines: 10,
      maxChars: 400,
    });
    expect(window.truncated).toBe(true);
    expect(window.startLine).toBeLessThanOrEqual(50);
    expect(window.endLine).toBeGreaterThanOrEqual(50);
    expect(window.content).toContain("line 50");
  });

  test("keeps the selected lines in view", () => {
    const content = Array.from({ length: 80 }, (_, i) => `row ${i + 1}`).join(
      "\n",
    );
    const window = getCellContextWindow(content, {
      selectionRange: { fromLine: 39, toLine: 41 },
      radiusLines: 5,
      maxChars: 200,
    });
    expect(window.content).toContain("row 40");
    expect(window.content).toContain("row 41");
    expect(window.content).toContain("row 42");
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

  test("parses insert_cells with backticks in cells_markdown JSON string", () => {
    // The cells_markdown value contains ``` (backtick triples) as part of
    // the JSON string encoding — these must not close the tool block.
    const json = JSON.stringify({
      name: "insert_cells",
      args: {
        after_index: 1,
        cells_markdown:
          "```\nx = 123\n```\n\n```\ny = 99 + x\n```\n\n```\nprint(x * y)\n```",
      },
    });
    const text = `Sure, I'll create those cells:\n\n\`\`\`tool\n${json}\n\`\`\`\n\nDone!`;
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("insert_cells");
    expect(blocks[0].args.cells_markdown).toContain("x = 123");
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
    expect(buildContextLabel({ ...base, cellIndex: 5, cellType: "code" })).toBe(
      "Cell #5 (code)",
    );
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

  test("NaN index is rejected", () => {
    const res = resolveIndex(NaN, cellList);
    expect("error" in res).toBe(true);
  });

  test("undefined index is rejected", () => {
    const res = resolveIndex(undefined as any, cellList);
    expect("error" in res).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  buildSystemPrompt                                                 */
/* ------------------------------------------------------------------ */

describe("buildSystemPrompt", () => {
  test("uses a context window for oversized focused-cell content", () => {
    const prompt = buildSystemPrompt({
      totalCells: 3,
      kernelName: "Python 3",
      language: "python",
      cellIndex: 2,
      cellType: "code",
      cursorLine: 29,
      cellContent: Array.from(
        { length: 80 },
        (_, i) => `print("line ${i + 1}")`,
      ).join("\n"),
    });
    expect(prompt).toContain("Showing lines");
    expect(prompt).toContain('print("line 30")');
  });

  test("truncates oversized selection text", () => {
    const selection = "y".repeat(800);
    const prompt = buildSystemPrompt({
      totalCells: 3,
      kernelName: "Python 3",
      language: "python",
      cellIndex: 1,
      cellType: "code",
      cellContent: "print('ok')",
      selection,
      selectionRange: { fromLine: 0, toLine: 0 },
    });
    expect(prompt).toContain("truncated");
    expect(prompt).toContain("800 chars total");
  });

  test("explicitly tells the model how to append a new cell at the bottom", () => {
    const prompt = buildSystemPrompt({
      totalCells: 3,
      kernelName: "Python 3",
      language: "python",
    });
    expect(prompt).toContain(
      "To append at the bottom or end of the notebook, use `after_index` equal to the current total number of cells.",
    );
    expect(prompt).toContain(
      "do not ask for clarification when the user already gave a clear instruction. Act on it directly",
    );
    expect(prompt).toContain(
      "`set_cell` replaces the entire cell input with exactly the content you provide.",
    );
    expect(prompt).toContain(
      "`run_cell` executes the cell's current contents, including any changes you just made with `set_cell` or `edit_cell`.",
    );
    expect(prompt).toContain(
      "Do not call `get_cell` only to verify or reinterpret a successful change.",
    );
  });

  test("read-only hint mode only exposes read tools", () => {
    const prompt = buildSystemPrompt(
      {
        totalCells: 3,
        kernelName: "Python 3",
        language: "python",
      },
      { readOnly: true },
    );
    expect(prompt).toContain("### get_cell");
    expect(prompt).toContain("### get_cells");
    expect(prompt).not.toContain("### set_cell");
    expect(prompt).not.toContain("### edit_cell");
    expect(prompt).not.toContain("### insert_cells");
    expect(prompt).not.toContain("### run_cell");
    expect(prompt).toContain("This is a hint request.");
  });
});

/* ------------------------------------------------------------------ */
/*  history compaction                                                */
/* ------------------------------------------------------------------ */

describe("compactAssistantMessageForHistory", () => {
  test("strips tool JSON and keeps a short tool summary", () => {
    const text =
      'I will inspect the notebook.\n\n```tool\n{"name":"get_cell","args":{"index":1}}\n```\n```tool\n{"name":"run_cell","args":{"index":1}}\n```';
    expect(compactAssistantMessageForHistory(text)).toBe(
      "I will inspect the notebook.\n\n[Used tools: get_cell, run_cell]",
    );
  });

  test("falls back to tool summary when the message is only tool blocks", () => {
    const text =
      '```tool\n{"name":"get_cells","args":{"start":1,"end":5}}\n```';
    expect(compactAssistantMessageForHistory(text)).toBe(
      "[Used tools: get_cells]",
    );
  });

  test("truncates oversized prose before putting it in history", () => {
    const result = compactAssistantMessageForHistory("x".repeat(5000));
    expect(result).toContain("truncated");
    expect(result).toContain("5000 chars total");
  });

  // Empty / whitespace-only assistant turns happen when a streaming call
  // is cancelled mid-flight or the provider hiccups. Returning "" here
  // would later poison the conversation: Anthropic's API rejects empty
  // text content blocks with a 400 error, breaking every follow-up turn.
  test("returns a non-empty placeholder for empty assistant text", () => {
    const result = compactAssistantMessageForHistory("");
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns a non-empty placeholder for whitespace-only text", () => {
    const result = compactAssistantMessageForHistory("   \n\n\t  ");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("compactToolResultForHistory", () => {
  test("truncates oversized tool results before reuse in prompts", () => {
    const result = compactToolResultForHistory("y".repeat(7000));
    expect(result).toContain("truncated");
    expect(result).toContain("7000 chars total");
  });
});

describe("buildPostToolPrompt", () => {
  test("prefers summarizing after a successful write batch", () => {
    const prompt = buildPostToolPrompt(
      [
        { name: "set_cell", args: { index: 1 } },
        { name: "run_cell", args: { index: 1 } },
      ],
      [
        '**set_cell**: {"status":"updated","index":1,"id":"abc"}',
        '**run_cell**: {"status":"completed","index":1,"output":"201"}',
      ].join("\n\n"),
    );
    expect(prompt).toContain(
      "The requested notebook changes were applied successfully.",
    );
    expect(prompt).toContain("Do NOT call get_cell/get_cells merely to verify");
    expect(prompt).toContain("Do NOT revert or undo the edit");
  });

  test("keeps the generic continue prompt when no successful write happened", () => {
    const prompt = buildPostToolPrompt(
      [{ name: "get_cell", args: { index: 1 } }],
      '**get_cell**: Cell #1 (code):\n```python\nprint("ok")\n```',
    );
    expect(prompt).toContain("Continue based on these results.");
  });
});

/* ------------------------------------------------------------------ */
/*  getFewShotExamples                                                 */
/* ------------------------------------------------------------------ */

describe("getFewShotExamples", () => {
  test("read-only examples have valid tool blocks that parse correctly", () => {
    const examples = getFewShotExamples(true);
    const assistantMsgs = examples.filter((m) => m.role === "assistant");
    expect(assistantMsgs.length).toBeGreaterThan(0);
    for (const msg of assistantMsgs) {
      const parsed = parseToolBlocks(msg.content);
      expect(parsed.length).toBeGreaterThan(0);
      for (const tc of parsed) {
        expect(typeof tc.name).toBe("string");
        expect(tc.name.length).toBeGreaterThan(0);
      }
    }
  });

  test("read-write examples have valid tool blocks that parse correctly", () => {
    const examples = getFewShotExamples(false);
    const assistantMsgs = examples.filter((m) => m.role === "assistant");
    expect(assistantMsgs.length).toBeGreaterThan(0);
    for (const msg of assistantMsgs) {
      const parsed = parseToolBlocks(msg.content);
      expect(parsed.length).toBeGreaterThan(0);
      for (const tc of parsed) {
        expect(typeof tc.name).toBe("string");
        expect(tc.name.length).toBeGreaterThan(0);
      }
    }
  });

  test("read-write example includes an edit_cell with valid search/replace edits", () => {
    const examples = getFewShotExamples(false);
    const editCalls = examples
      .filter((m) => m.role === "assistant")
      .flatMap((m) => parseToolBlocks(m.content))
      .filter((tc) => tc.name === "edit_cell");
    expect(editCalls.length).toBeGreaterThan(0);
    for (const tc of editCalls) {
      expect(tc.args.edits).toContain("<<<SEARCH");
      expect(tc.args.edits).toContain(">>>REPLACE");
      expect(tc.args.edits).toContain("<<<END");
    }
  });

  test("read-only examples only use read tools", () => {
    const examples = getFewShotExamples(true);
    const allTools = examples
      .filter((m) => m.role === "assistant")
      .flatMap((m) => parseToolBlocks(m.content));
    for (const tc of allTools) {
      expect(["get_cell", "get_cells", "cell_count"]).toContain(tc.name);
    }
  });
});
