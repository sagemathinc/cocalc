/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { LineSource, parseLines } from "./parser";
import { WidgetDescriptor } from "./types";

/** Build a LineSource from an array of lines (one entry per line). */
function source(lines: string[]): LineSource {
  return {
    getLine: (n: number) => lines[n] ?? "",
    lineCount: () => lines.length,
  };
}

/** Parse a string[] over its whole extent. */
function parse(lines: string[]): WidgetDescriptor[] {
  return parseLines(source(lines), 0, lines.length);
}

/** Parse a single line. */
function parse1(line: string): WidgetDescriptor[] {
  return parse([line]);
}

/** Find the first descriptor of a given type. */
function first(
  ds: WidgetDescriptor[],
  type: string,
): WidgetDescriptor | undefined {
  return ds.find((d) => d.type === type);
}

describe("parseLines — representative cases per family", () => {
  it("textbf single-arg command", () => {
    const ds = parse1("hello \\textbf{world} bye");
    const d = first(ds, "textbf")!;
    expect(d).toBeDefined();
    expect(d.from).toEqual({ line: 0, ch: 6 });
    expect(d.to).toEqual({ line: 0, ch: 20 });
    expect(d.source).toBe("\\textbf{world}");
    expect(d.payload).toMatchObject({ content: "world" });
  });

  it("section single-arg command", () => {
    const ds = parse1("\\section{Intro}");
    const d = first(ds, "section")!;
    expect(d).toBeDefined();
    expect(d.from).toEqual({ line: 0, ch: 0 });
    expect(d.to).toEqual({ line: 0, ch: 15 });
    expect(d.payload).toMatchObject({ content: "Intro" });
  });

  it("inline math $…$", () => {
    const ds = parse1("text $x+y$ end");
    const d = first(ds, "math-inline")!;
    expect(d).toBeDefined();
    expect(d.from).toEqual({ line: 0, ch: 5 });
    expect(d.to).toEqual({ line: 0, ch: 10 });
    expect(d.source).toBe("$x+y$");
    expect(d.payload).toMatchObject({ content: "x+y" });
  });

  it("display math \\[…\\] single line", () => {
    const ds = parse1("\\[ a=b \\]");
    const d = first(ds, "math-display")!;
    expect(d).toBeDefined();
    expect(d.from).toEqual({ line: 0, ch: 0 });
    expect(d.to).toEqual({ line: 0, ch: 9 });
    expect(d.payload).toMatchObject({ content: " a=b " });
  });

  it("display math \\[…\\] multi line", () => {
    const ds = parse(["\\[", "  a = b", "\\]"]);
    const d = first(ds, "math-display")!;
    expect(d).toBeDefined();
    expect(d.from).toEqual({ line: 0, ch: 0 });
    expect(d.to).toEqual({ line: 2, ch: 2 });
    expect(d.source).toBe("\\[\n  a = b\n\\]");
  });

  it("math env \\begin{equation}…\\end{equation}", () => {
    const ds = parse(["\\begin{equation}", "  E=mc^2", "\\end{equation}"]);
    const d = first(ds, "math-env")!;
    expect(d).toBeDefined();
    expect(d.from).toEqual({ line: 0, ch: 0 });
    expect(d.to).toEqual({ line: 2, ch: 14 });
    expect(d.payload).toMatchObject({ envName: "equation" });
  });

  it("list env itemize with items", () => {
    const ds = parse([
      "\\begin{itemize}",
      "  \\item one",
      "  \\item two",
      "\\end{itemize}",
    ]);
    expect(first(ds, "list-env-begin")).toBeDefined();
    expect(first(ds, "list-env-end")).toBeDefined();
    const items = ds.filter((d) => d.type === "list-item");
    expect(items.length).toBe(2);
    expect(items[0].payload).toMatchObject({ index: 1, envName: "itemize" });
    expect(items[1].payload).toMatchObject({ index: 2 });
  });

  it("\\itemsep / \\itemindent are NOT matched as list items", () => {
    const ds = parse([
      "\\begin{itemize}",
      "  \\setlength{\\itemsep}{0pt}",
      "  \\itemindent=1em",
      "  \\item real one",
      "  \\item real two",
      "\\end{itemize}",
    ]);
    const items = ds.filter((d) => d.type === "list-item");
    // Only the two genuine \item tokens — the \itemsep/\itemindent
    // prefixes must not be miscounted (which would misnumber items).
    expect(items.length).toBe(2);
    expect(items[0].payload).toMatchObject({ index: 1 });
    expect(items[1].payload).toMatchObject({ index: 2 });
  });

  it("\\item[label] keeps the label and the token boundary", () => {
    const ds = parse([
      "\\begin{itemize}",
      "  \\item[$\\star$] starred",
      "  \\item plain",
      "\\end{itemize}",
    ]);
    const items = ds.filter((d) => d.type === "list-item");
    expect(items.length).toBe(2);
    expect(items[0].payload).toMatchObject({ label: "$\\star$" });
    expect(items[1].payload).toMatchObject({ label: null });
  });

  it("href two-arg command", () => {
    const ds = parse1("see \\href{https://x.org}{here}");
    const d = first(ds, "href")!;
    expect(d).toBeDefined();
    expect(d.payload).toMatchObject({
      arg1: "https://x.org",
      arg2: "here",
    });
  });

  it("inline verb", () => {
    const ds = parse1("code \\verb|x_y| done");
    const d = first(ds, "verb")!;
    expect(d).toBeDefined();
    expect(d.payload).toMatchObject({ content: "x_y", delim: "|" });
  });

  it("braced font-size group {\\Large …}", () => {
    const ds = parse1("a {\\Large big} b");
    const d = first(ds, "font-size")!;
    expect(d).toBeDefined();
    expect(d.source).toBe("{\\Large big}");
    expect(d.payload).toMatchObject({ sizeName: "Large", content: "big" });
  });

  it("font-size keeps nested constructs as content (widest-wins)", () => {
    const ds = parse1("{\\small \\textbf{x}}");
    const fs = first(ds, "font-size")!;
    expect(fs).toBeDefined();
    expect(fs.payload).toMatchObject({
      sizeName: "small",
      content: "\\textbf{x}",
    });
    // The inner textbf is subsumed by the wider font-size cover.
    expect(first(ds, "textbf")).toBeUndefined();
  });

  it("{\\Largex …} is not a size group (token boundary)", () => {
    expect(first(parse1("{\\Largex y}"), "font-size")).toBeUndefined();
  });

  it("\\section{\\Large T} does not emit a stray font-size widget", () => {
    // The `{` is the section's argument brace; the section descriptor is
    // wider, so dropOverlaps removes the font-size false positive.
    const ds = parse1("\\section{\\Large Title}");
    expect(first(ds, "section")).toBeDefined();
    expect(first(ds, "font-size")).toBeUndefined();
  });

  it("custom-macro fallback for unknown \\cmd{…}", () => {
    const ds = parse1("\\mycmd{body}");
    const d = first(ds, "custom-macro")!;
    expect(d).toBeDefined();
    expect(d.payload).toMatchObject({ cmdName: "\\mycmd", content: "body" });
  });

  it("skip-list definitions don't leak custom-macro chips from their body", () => {
    // \newcommand{\R}{\mathbb{R}} must be skipped WHOLE — the scanner
    // must not descend into the body and emit a chip for \mathbb{R}.
    const ds = parse1("\\newcommand{\\R}{\\mathbb{R}}");
    expect(first(ds, "custom-macro")).toBeUndefined();
  });

  it("skip-list multi-arg command (\\definecolor) is fully skipped", () => {
    const ds = parse1("\\definecolor{mycol}{rgb}{1,0,0}");
    expect(first(ds, "custom-macro")).toBeUndefined();
  });

  it("a real custom macro AFTER a skip-list command still renders", () => {
    const ds = parse1("\\setlength{\\itemsep}{0pt} \\mycmd{x}");
    const d = first(ds, "custom-macro")!;
    expect(d).toBeDefined();
    expect(d.payload).toMatchObject({ cmdName: "\\mycmd", content: "x" });
  });
});

describe("TASK 2 — isEscaped backslash parity", () => {
  it("\\\\\\[ x \\\\\\] → line break then REAL display math", () => {
    // Source: `\\\[ x \\\]` — `\\` (break) + `\[ x \]` (display math).
    const ds = parse1("\\\\\\[ x \\\\\\]");
    const d = first(ds, "math-display")!;
    expect(d).toBeDefined();
    // `\[` starts at ch 2 (after the `\\` line break).
    expect(d.from).toEqual({ line: 0, ch: 2 });
  });

  it("\\\\\\textbf{x} → line break then REAL \\textbf", () => {
    const ds = parse1("\\\\\\textbf{x}");
    const d = first(ds, "textbf")!;
    expect(d).toBeDefined();
    expect(d.from).toEqual({ line: 0, ch: 2 });
    expect(d.payload).toMatchObject({ content: "x" });
  });

  it("\\$ → escaped dollar is NOT math", () => {
    const ds = parse1("a \\$ b");
    expect(first(ds, "math-inline")).toBeUndefined();
  });

  it("\\\\$x$ → line break then real inline math", () => {
    const ds = parse1("\\\\$x$");
    const d = first(ds, "math-inline")!;
    expect(d).toBeDefined();
    // `$x$` begins at ch 2 after the `\\` break.
    expect(d.from).toEqual({ line: 0, ch: 2 });
    expect(d.payload).toMatchObject({ content: "x" });
  });
});

describe("TASK 3 — opaque verbatim/listing/minted bodies", () => {
  it("lstlisting body with literal \\end{verbatim} does not corrupt env stack", () => {
    const ds = parse([
      "\\begin{lstlisting}",
      "code line",
      "\\end{verbatim}",
      "\\begin{itemize}",
      "more code",
      "\\end{lstlisting}",
      "\\section{After}",
    ]);
    // The code-listing env should cover lines 0..5 (closed by its own
    // matching \end, NOT the stray \end{verbatim} or \begin{itemize}).
    const code = first(ds, "code-listing-env")!;
    expect(code).toBeDefined();
    expect(code.from).toEqual({ line: 0, ch: 0 });
    // `\end{lstlisting}` is 16 chars wide.
    expect(code.to).toEqual({ line: 5, ch: 16 });
    // The section AFTER the listing must still be emitted normally,
    // i.e. env pairing surrounding the listing is intact.
    const section = first(ds, "section")!;
    expect(section).toBeDefined();
    expect(section.from.line).toBe(6);
    // No spurious list descriptors from the literal \begin{itemize}.
    expect(first(ds, "list-env-begin")).toBeUndefined();
  });

  it("verbatim body with literal \\begin{itemize} stays opaque", () => {
    const ds = parse([
      "\\begin{verbatim}",
      "\\begin{itemize}",
      "\\item not an item",
      "\\end{verbatim}",
      "\\textbf{after}",
    ]);
    const v = first(ds, "verbatim-env")!;
    expect(v).toBeDefined();
    expect(v.to).toEqual({ line: 3, ch: 14 });
    expect(first(ds, "list-item")).toBeUndefined();
    // textbf after the verbatim is unaffected.
    expect(first(ds, "textbf")).toBeDefined();
  });

  it("unterminated verbatim still protects its body from per-line scanners", () => {
    // No closing \end{verbatim}: the env never pops, so the end-event
    // branch that would push its protectedRange never runs. The body
    // must still be shielded so raw code doesn't emit bogus widgets.
    const ds = parse([
      "\\begin{verbatim}",
      "$x^2$",
      "\\textbf{raw}",
    ]);
    expect(first(ds, "math-inline")).toBeUndefined();
    expect(first(ds, "textbf")).toBeUndefined();
  });
});

describe("TASK 4 — dropOverlaps widest-wins", () => {
  it("container subsumes an inner sibling that starts at the same column", () => {
    // A math env beginning at line 0 ch 0 should win over any inner
    // descriptor with the same `from`. Use a math env containing a
    // \textbf so the inner single-line descriptor competes.
    const ds = parse([
      "\\begin{equation}",
      "\\textbf{x}",
      "\\end{equation}",
    ]);
    const types = ds.map((d) => d.type);
    expect(types).toContain("math-env");
    // The inner \textbf is inside the covering math-env range → dropped.
    expect(types).not.toContain("textbf");
  });

  it("wider container at equal `from` wins over a tiny earlier sibling, no gap", () => {
    // Two descriptors starting at the same column: \href (wide,
    // two-arg) vs a custom-macro that would start at the same place is
    // impossible, so simulate via overlapping math + inline. Use
    // `$$...$$` display covering an inner `$...$`-like region.
    const ds = parse1("$$ \\textbf{a} $$");
    // The display-math covers the whole line; inner textbf dropped.
    const disp = first(ds, "math-display")!;
    expect(disp).toBeDefined();
    expect(disp.from).toEqual({ line: 0, ch: 0 });
    expect(ds.map((d) => d.type)).not.toContain("textbf");
  });

  it("non-overlapping siblings on the same line are both kept", () => {
    const ds = parse1("\\textbf{a} and \\textit{b}");
    expect(first(ds, "textbf")).toBeDefined();
    expect(first(ds, "textit")).toBeDefined();
  });
});

describe("stripComment behavior", () => {
  it("% \\section{x} → comment, emits nothing", () => {
    const ds = parse1("% \\section{x}");
    expect(ds).toEqual([]);
  });

  it("\\% is not a comment — content before/after a real command kept", () => {
    const ds = parse1("100\\% sure \\textbf{yes}");
    // The `\%` is escaped so the line is NOT truncated; \textbf is seen.
    const d = first(ds, "textbf")!;
    expect(d).toBeDefined();
    expect(d.payload).toMatchObject({ content: "yes" });
  });

  it("inline comment truncates trailing command", () => {
    const ds = parse1("\\textbf{a} % \\textit{b}");
    expect(first(ds, "textbf")).toBeDefined();
    expect(first(ds, "textit")).toBeUndefined();
  });
});
