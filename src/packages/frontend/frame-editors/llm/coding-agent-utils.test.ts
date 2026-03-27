/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  applyEditBlocks,
  applySearchReplace,
  buildSystemPrompt,
  extractCodeBlock,
  formatDiffBlock,
  formatEditBlocksAsDiff,
  formatExecResult,
  formatFileSearchReplaceAsDiff,
  formatSearchReplaceAsDiff,
  fulfillShowBlocks,
  getDocumentContextWindow,
  parseEditBlocks,
  parseExecBlocks,
  parseFileSearchReplaceBlocks,
  parseSearchReplaceBlocks,
  parseShowBlocks,
  truncateMiddle,
} from "./coding-agent-utils";

/* ------------------------------------------------------------------ */
/*  parseSearchReplaceBlocks                                           */
/* ------------------------------------------------------------------ */

describe("parseSearchReplaceBlocks", () => {
  it("parses a single block", () => {
    const text = `Some text
<<<SEARCH
old code
>>>REPLACE
new code
<<<END
More text`;
    const blocks = parseSearchReplaceBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ search: "old code", replace: "new code" });
  });

  it("parses multiple blocks", () => {
    const text = `<<<SEARCH
a
>>>REPLACE
b
<<<END
<<<SEARCH
c
>>>REPLACE
d
<<<END`;
    expect(parseSearchReplaceBlocks(text)).toHaveLength(2);
  });

  it("handles multi-line search/replace", () => {
    const text = `<<<SEARCH
line1
line2
>>>REPLACE
line3
line4
line5
<<<END`;
    const [block] = parseSearchReplaceBlocks(text);
    expect(block.search).toBe("line1\nline2");
    expect(block.replace).toBe("line3\nline4\nline5");
  });

  it("returns empty array when no blocks", () => {
    expect(parseSearchReplaceBlocks("just plain text")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  applySearchReplace                                                 */
/* ------------------------------------------------------------------ */

describe("applySearchReplace", () => {
  it("applies a simple replacement", () => {
    const { result, applied, failed } = applySearchReplace("hello world", [
      { search: "world", replace: "earth" },
    ]);
    expect(result).toBe("hello earth");
    expect(applied).toBe(1);
    expect(failed).toBe(0);
  });

  it("counts failed matches", () => {
    const { applied, failed } = applySearchReplace("hello", [
      { search: "missing", replace: "x" },
    ]);
    expect(applied).toBe(0);
    expect(failed).toBe(1);
  });

  it("applies multiple blocks sequentially", () => {
    const { result } = applySearchReplace("a b c", [
      { search: "a", replace: "x" },
      { search: "c", replace: "z" },
    ]);
    expect(result).toBe("x b z");
  });

  it("falls back to trimmed match", () => {
    const { result, applied } = applySearchReplace("  hello  \nworld", [
      { search: "hello", replace: "hi" },
    ]);
    expect(applied).toBe(1);
    expect(result).toContain("hi");
  });

  it("falls back to trimmed match for multi-line blocks", () => {
    const { result, applied, failed } = applySearchReplace(
      "  const x = 1;\n  const y = 2;\nreturn x + y;\n",
      [
        {
          search: "const x = 1;\nconst y = 2;",
          replace: "const sum = 3;",
        },
      ],
    );
    expect(applied).toBe(1);
    expect(failed).toBe(0);
    expect(result).toContain("const sum = 3;");
  });
});

/* ------------------------------------------------------------------ */
/*  formatExecResult                                                   */
/* ------------------------------------------------------------------ */

describe("formatExecResult", () => {
  it("uses safe fences when stdout contains backticks", () => {
    const rendered = formatExecResult(
      { stdout: "before\n```js\nalert(1)\n```\nafter", exit_code: 1 },
      "demo",
    );
    expect(rendered).toContain("**stdout:**");
    expect(rendered).toContain("````");
    expect(rendered).toContain("Exit code: 1");
  });
});

/* ------------------------------------------------------------------ */
/*  parseEditBlocks                                                    */
/* ------------------------------------------------------------------ */

describe("parseEditBlocks", () => {
  it("parses a line range edit", () => {
    const text = `<<<EDIT lines 5-10
new content
<<<END`;
    const blocks = parseEditBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      startLine: 5,
      endLine: 10,
      replacement: "new content",
    });
  });

  it("parses a single-line edit", () => {
    const text = `<<<EDIT line 3
replacement
<<<END`;
    const blocks = parseEditBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(3);
    expect(blocks[0].endLine).toBe(3);
  });

  it("parses multiple edit blocks", () => {
    const text = `<<<EDIT lines 1-2
a
<<<END
Some text
<<<EDIT line 5
b
<<<END`;
    expect(parseEditBlocks(text)).toHaveLength(2);
  });

  it("returns empty array when no blocks", () => {
    expect(parseEditBlocks("no edit blocks here")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  applyEditBlocks                                                    */
/* ------------------------------------------------------------------ */

describe("applyEditBlocks", () => {
  const doc = "line1\nline2\nline3\nline4\nline5";

  it("replaces a single line", () => {
    const { result, applied } = applyEditBlocks(doc, [
      { startLine: 2, endLine: 2, replacement: "replaced" },
    ]);
    expect(applied).toBe(1);
    expect(result).toBe("line1\nreplaced\nline3\nline4\nline5");
  });

  it("replaces a range of lines", () => {
    const { result } = applyEditBlocks(doc, [
      { startLine: 2, endLine: 4, replacement: "new2\nnew3" },
    ]);
    expect(result).toBe("line1\nnew2\nnew3\nline5");
  });

  it("deletes lines with empty replacement", () => {
    const { result } = applyEditBlocks(doc, [
      { startLine: 3, endLine: 3, replacement: "" },
    ]);
    expect(result).toBe("line1\nline2\nline4\nline5");
  });

  it("applies multiple edits bottom-to-top", () => {
    const { result, applied } = applyEditBlocks(doc, [
      { startLine: 1, endLine: 1, replacement: "first" },
      { startLine: 5, endLine: 5, replacement: "last" },
    ]);
    expect(applied).toBe(2);
    expect(result).toBe("first\nline2\nline3\nline4\nlast");
  });

  it("counts out-of-range blocks as failed", () => {
    const { failed } = applyEditBlocks(doc, [
      { startLine: 0, endLine: 1, replacement: "x" },
      { startLine: 100, endLine: 100, replacement: "y" },
    ]);
    expect(failed).toBe(2);
  });

  it("fails when endLine exceeds document length", () => {
    const { applied, failed } = applyEditBlocks(doc, [
      { startLine: 3, endLine: 20, replacement: "wrong span" },
    ]);
    expect(applied).toBe(0);
    expect(failed).toBe(1);
  });

  it("succeeds when endLine equals document length", () => {
    const { result, applied } = applyEditBlocks(doc, [
      { startLine: 4, endLine: 5, replacement: "new4\nnew5" },
    ]);
    expect(applied).toBe(1);
    expect(result).toBe("line1\nline2\nline3\nnew4\nnew5");
  });
});

/* ------------------------------------------------------------------ */
/*  formatSearchReplaceAsDiff                                          */
/* ------------------------------------------------------------------ */

describe("formatSearchReplaceAsDiff", () => {
  it("converts search/replace to diff format", () => {
    const text = `<<<SEARCH
old
>>>REPLACE
new
<<<END`;
    const result = formatSearchReplaceAsDiff(text);
    expect(result).toContain("```diff");
    expect(result).toContain("- old");
    expect(result).toContain("+ new");
    expect(result).toContain("```");
  });

  it("preserves surrounding text", () => {
    const text = `Before\n<<<SEARCH\na\n>>>REPLACE\nb\n<<<END\nAfter`;
    const result = formatSearchReplaceAsDiff(text);
    expect(result).toMatch(/^Before/);
    expect(result).toMatch(/After$/);
  });
});

/* ------------------------------------------------------------------ */
/*  parseFileSearchReplaceBlocks                                       */
/* ------------------------------------------------------------------ */

describe("parseFileSearchReplaceBlocks", () => {
  it("parses a single block with file path", () => {
    const text = `Some text
<<<SEARCH src/app.tsx
old code
>>>REPLACE
new code
<<<END
More text`;
    const blocks = parseFileSearchReplaceBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      path: "src/app.tsx",
      search: "old code",
      replace: "new code",
    });
  });

  it("parses multiple blocks with different paths", () => {
    const text = `<<<SEARCH src/a.ts
a
>>>REPLACE
b
<<<END
<<<SEARCH src/b.ts
c
>>>REPLACE
d
<<<END`;
    const blocks = parseFileSearchReplaceBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].path).toBe("src/a.ts");
    expect(blocks[1].path).toBe("src/b.ts");
  });

  it("handles multi-line search/replace with path", () => {
    const text = `<<<SEARCH components/header.tsx
line1
line2
>>>REPLACE
line3
line4
line5
<<<END`;
    const [block] = parseFileSearchReplaceBlocks(text);
    expect(block.path).toBe("components/header.tsx");
    expect(block.search).toBe("line1\nline2");
    expect(block.replace).toBe("line3\nline4\nline5");
  });

  it("returns empty array when no blocks", () => {
    expect(parseFileSearchReplaceBlocks("just plain text")).toEqual([]);
  });

  it("does NOT match blocks without a path (single-file format)", () => {
    const text = `<<<SEARCH
old code
>>>REPLACE
new code
<<<END`;
    // The regex requires \s+(.+) after SEARCH, so a bare newline won't match
    expect(parseFileSearchReplaceBlocks(text)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  formatDiffBlock                                                    */
/* ------------------------------------------------------------------ */

describe("formatDiffBlock", () => {
  it("formats a diff block without file path", () => {
    const result = formatDiffBlock("old\n", "new\n");
    expect(result).toBe("```diff\n- old\n+ new\n```");
  });

  it("formats a diff block with file path", () => {
    const result = formatDiffBlock("old\n", "new\n", "src/app.tsx");
    expect(result).toBe("**\u270E src/app.tsx**\n```diff\n- old\n+ new\n```");
  });

  it("handles multi-line content", () => {
    const result = formatDiffBlock("a\nb\n", "c\nd\ne\n");
    expect(result).toContain("- a");
    expect(result).toContain("- b");
    expect(result).toContain("+ c");
    expect(result).toContain("+ d");
    expect(result).toContain("+ e");
  });
});

/* ------------------------------------------------------------------ */
/*  formatFileSearchReplaceAsDiff                                      */
/* ------------------------------------------------------------------ */

describe("formatFileSearchReplaceAsDiff", () => {
  it("converts file search/replace to diff format with path header", () => {
    const text = `<<<SEARCH src/app.tsx
old
>>>REPLACE
new
<<<END`;
    const result = formatFileSearchReplaceAsDiff(text);
    expect(result).toContain("**\u270E src/app.tsx**");
    expect(result).toContain("```diff");
    expect(result).toContain("- old");
    expect(result).toContain("+ new");
  });

  it("preserves surrounding text", () => {
    const text = `Before\n<<<SEARCH src/a.ts\na\n>>>REPLACE\nb\n<<<END\nAfter`;
    const result = formatFileSearchReplaceAsDiff(text);
    expect(result).toMatch(/^Before/);
    expect(result).toMatch(/After$/);
  });

  it("does not match blocks without a path", () => {
    const text = `<<<SEARCH
old
>>>REPLACE
new
<<<END`;
    // No path means no match for the file-aware regex
    const result = formatFileSearchReplaceAsDiff(text);
    expect(result).toBe(text); // unchanged
  });
});

/* ------------------------------------------------------------------ */
/*  formatEditBlocksAsDiff                                             */
/* ------------------------------------------------------------------ */

describe("formatEditBlocksAsDiff", () => {
  it("shows old and new lines in diff format", () => {
    const base = "line1\nline2\nline3";
    const text = `<<<EDIT lines 2-2
replaced
<<<END`;
    const result = formatEditBlocksAsDiff(text, base);
    expect(result).toContain("```diff");
    expect(result).toContain("- line2");
    expect(result).toContain("+ replaced");
  });
});

/* ------------------------------------------------------------------ */
/*  extractCodeBlock                                                   */
/* ------------------------------------------------------------------ */

describe("extractCodeBlock", () => {
  it("extracts a fenced code block", () => {
    const text = "Some text\n```python\nprint('hi')\n```\nMore text";
    expect(extractCodeBlock(text)).toBe("print('hi')\n");
  });

  it("returns undefined when no code block", () => {
    expect(extractCodeBlock("no code here")).toBeUndefined();
  });

  it("skips exec blocks and returns the next code block", () => {
    const text = `Here's how to compile:
\`\`\`exec
gcc hello.c -o ./hello && ./hello
\`\`\`

Here's the code:
\`\`\`c
#include <stdio.h>
int main() { printf("hello\\n"); return 0; }
\`\`\``;
    const result = extractCodeBlock(text);
    expect(result).toContain("#include <stdio.h>");
    expect(result).not.toContain("gcc");
  });

  it("returns undefined when only exec blocks exist", () => {
    const text = "Run this:\n```exec\nmake clean && make\n```";
    expect(extractCodeBlock(text)).toBeUndefined();
  });

  it("extracts block with no language tag", () => {
    const text = "```\nsome code\n```";
    expect(extractCodeBlock(text)).toBe("some code\n");
  });

  it("extracts first non-exec block among multiple", () => {
    const text = `\`\`\`exec
cmd1
\`\`\`
\`\`\`exec
cmd2
\`\`\`
\`\`\`python
print("hello")
\`\`\`
\`\`\`js
console.log("hi")
\`\`\``;
    expect(extractCodeBlock(text)).toBe('print("hello")\n');
  });

  it("handles nested fences using 4+ backticks", () => {
    const text = `Here is the file:
\`\`\`\`markdown
# README

\`\`\`python
print("example")
\`\`\`

More text.
\`\`\`\``;
    const result = extractCodeBlock(text);
    expect(result).toContain("```python");
    expect(result).toContain('print("example")');
    expect(result).toContain("More text.");
  });

  it("does not truncate at inner triple fences", () => {
    const text = `\`\`\`\`html
<pre><code>
\`\`\`
some code
\`\`\`
</code></pre>
\`\`\`\``;
    const result = extractCodeBlock(text);
    expect(result).toContain("some code");
    expect(result).toContain("</code></pre>");
  });
});

/* ------------------------------------------------------------------ */
/*  getDocumentContextWindow                                           */
/* ------------------------------------------------------------------ */

describe("getDocumentContextWindow", () => {
  it("returns a bounded window around the cursor", () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    const window = getDocumentContextWindow(content, {
      cursorLine: 49,
      radiusLines: 10,
      maxChars: 400,
    });
    expect(window.truncated).toBe(true);
    expect(window.startLine).toBeLessThanOrEqual(50);
    expect(window.endLine).toBeGreaterThanOrEqual(50);
    expect(window.content).toContain("line 50");
  });

  it("keeps a selection in view", () => {
    const content = Array.from({ length: 80 }, (_, i) => `row ${i + 1}`).join(
      "\n",
    );
    const window = getDocumentContextWindow(content, {
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
/*  parseShowBlocks                                                    */
/* ------------------------------------------------------------------ */

describe("parseShowBlocks", () => {
  it("parses a show block", () => {
    const text = `<<<SHOW lines 10-20
<<<END`;
    const blocks = parseShowBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ startLine: 10, endLine: 20 });
  });

  it("parses single-line show", () => {
    const text = `<<<SHOW line 5
<<<END`;
    const blocks = parseShowBlocks(text);
    expect(blocks[0]).toEqual({ startLine: 5, endLine: 5 });
  });
});

/* ------------------------------------------------------------------ */
/*  fulfillShowBlocks                                                  */
/* ------------------------------------------------------------------ */

describe("fulfillShowBlocks", () => {
  const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join(
    "\n",
  );

  it("returns null for empty blocks", () => {
    expect(fulfillShowBlocks([], content)).toBeNull();
  });

  it("returns numbered lines for a range", () => {
    const result = fulfillShowBlocks([{ startLine: 2, endLine: 4 }], content)!;
    expect(result).toContain("Lines 2–4 of 10 lines");
    expect(result).toContain("line 2");
    expect(result).toContain("line 4");
    expect(result).not.toContain("line 1");
    expect(result).not.toContain("line 5");
  });

  it("clamps to document bounds", () => {
    const result = fulfillShowBlocks(
      [{ startLine: 8, endLine: 100 }],
      content,
    )!;
    expect(result).toContain("line 10");
    expect(result).toContain("Lines 8–10");
  });

  it("adds language tag to opening fence", () => {
    const result = fulfillShowBlocks(
      [{ startLine: 1, endLine: 2 }],
      content,
      100,
      "python",
    )!;
    expect(result).toContain("```python");
  });

  it("includes filename in header when provided", () => {
    const result = fulfillShowBlocks(
      [{ startLine: 1, endLine: 3 }],
      content,
      100,
      "",
      "test.tex",
    )!;
    expect(result).toContain("Lines 1–3 of test.tex (10 lines)");
  });

  it("skips blocks where startLine exceeds document length", () => {
    const result = fulfillShowBlocks(
      [{ startLine: 500, endLine: 510 }],
      content,
    );
    // All blocks are out of range — nothing to show
    expect(result).toBeNull();
  });

  it("returns valid blocks when mixed with out-of-range ones", () => {
    const result = fulfillShowBlocks(
      [
        { startLine: 500, endLine: 510 }, // out of range — skipped
        { startLine: 1, endLine: 3 }, // valid
      ],
      content,
    )!;
    expect(result).toContain("line 1");
    expect(result).toContain("line 3");
    expect(result).not.toContain("500");
  });

  it("truncates oversized show responses to stay within budget", () => {
    const longContent = Array.from(
      { length: 20 },
      (_, i) => `${i + 1}: ${"x".repeat(300)}`,
    ).join("\n");
    const result = fulfillShowBlocks(
      [{ startLine: 1, endLine: 20 }],
      longContent,
      100,
    )!;
    expect(result).toContain("(truncated)");
  });
});

/* ------------------------------------------------------------------ */
/*  parseExecBlocks                                                    */
/* ------------------------------------------------------------------ */

describe("parseExecBlocks", () => {
  it("parses an exec block", () => {
    const text = "text\n```exec\nls -la\n```\nmore";
    const blocks = parseExecBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toBe("ls -la");
  });

  it("ignores non-exec code blocks", () => {
    const text = "```python\nprint('hi')\n```";
    expect(parseExecBlocks(text)).toHaveLength(0);
  });

  it("skips empty exec blocks", () => {
    const text = "```exec\n\n```";
    expect(parseExecBlocks(text)).toHaveLength(0);
  });

  it("handles exec blocks wrapped with 4+ backticks", () => {
    const text = `\`\`\`\`exec
echo "hello \`\`\` world"
\`\`\`\``;
    const blocks = parseExecBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toContain('echo "hello ``` world"');
  });
});

/* ------------------------------------------------------------------ */
/*  truncateMiddle                                                     */
/* ------------------------------------------------------------------ */

describe("truncateMiddle", () => {
  it("returns short text unchanged", () => {
    expect(truncateMiddle("hello")).toBe("hello");
  });

  it("returns text at exactly the limit unchanged", () => {
    const text = "x".repeat(1000);
    expect(truncateMiddle(text)).toBe(text);
  });

  it("truncates text exceeding the limit", () => {
    const text = "x".repeat(2000);
    const result = truncateMiddle(text);
    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain("characters omitted");
    // Should start and end with 500 x's
    expect(result.startsWith("x".repeat(500))).toBe(true);
    expect(result.endsWith("x".repeat(500))).toBe(true);
  });

  it("respects custom limit and keep parameters", () => {
    const text = "abcdefghij"; // 10 chars
    const result = truncateMiddle(text, 6, 2);
    expect(result.startsWith("ab")).toBe(true);
    expect(result.endsWith("ij")).toBe(true);
    expect(result).toContain("6 characters omitted");
  });
});

/* ------------------------------------------------------------------ */
/*  buildSystemPrompt                                                  */
/* ------------------------------------------------------------------ */

describe("buildSystemPrompt", () => {
  it("uses a context window for oversized documents", () => {
    const prompt = buildSystemPrompt(
      "notes.md",
      {
        content: Array.from(
          { length: 80 },
          (_, i) => `paragraph ${i + 1} ${"x".repeat(40)}`,
        ).join("\n"),
        visibleRange: { firstLine: 28, lastLine: 40 },
        cursorLine: 32,
      },
      false,
    );
    expect(prompt).toContain("Context window of the document");
    expect(prompt).toContain("paragraph 33");
  });

  it("truncates oversized selected text", () => {
    const prompt = buildSystemPrompt(
      "script.py",
      {
        content: "print('ok')",
        cursorLine: 0,
        selection: "x".repeat(2000),
      },
      false,
    );
    expect(prompt).toContain("characters omitted");
  });

  it("explicitly forbids prose and ordinary code blocks for edits", () => {
    const prompt = buildSystemPrompt(
      "script.py",
      {
        content: "print('ok')",
        cursorLine: 0,
      },
      false,
    );
    expect(prompt).toContain("respond with <<<EDIT ...>>> blocks, not prose");
    expect(prompt).toContain(
      "Do NOT put file edits in ordinary fenced code blocks.",
    );
  });

  it("supports a read-only hint mode with no edit or exec instructions", () => {
    const prompt = buildSystemPrompt(
      "script.py",
      {
        content: "print('ok')",
        cursorLine: 0,
      },
      false,
      { readOnly: true },
    );
    expect(prompt).toContain("This is a hint request.");
    expect(prompt).not.toContain("When you want to edit the file");
    expect(prompt).not.toContain("```exec");
    expect(prompt).toContain("<<<SHOW lines N-M");
  });
});
