/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Import the SOURCE module (not the package export, which jest resolves
// to the stale compiled dist/) so this exercises the current
// extraMacros signature. Webpack resolves @cocalc/frontend to source, so
// the app uses this same code path.
import mathToHtml from "../../../misc/math-to-html";

import { extractMacros } from "./latex-macros";

describe("extractMacros", () => {
  it("\\newcommand{\\R}{\\mathbb{R}}", () => {
    expect(extractMacros("\\newcommand{\\R}{\\mathbb{R}}")).toEqual({
      "\\R": "\\mathbb{R}",
    });
  });

  it("\\newcommand with an argument", () => {
    expect(extractMacros("\\newcommand{\\vec}[1]{\\mathbf{#1}}")).toEqual({
      "\\vec": "\\mathbf{#1}",
    });
  });

  it("bare-name form \\newcommand\\foo{\\alpha}", () => {
    expect(extractMacros("\\newcommand\\foo{\\alpha}")).toEqual({
      "\\foo": "\\alpha",
    });
  });

  it("\\renewcommand / \\providecommand and last-wins", () => {
    const m = extractMacros(
      "\\newcommand{\\x}{a}\n\\renewcommand{\\x}{b}\n\\providecommand{\\y}{c}",
    );
    expect(m).toEqual({ "\\x": "b", "\\y": "c" });
  });

  it("\\providecommand keeps an existing definition (LaTeX semantics)", () => {
    // \newcommand defines \R; a later \providecommand{\R} is a no-op.
    expect(
      extractMacros(
        "\\newcommand{\\R}{\\mathbb{R}}\n\\providecommand{\\R}{\\mathbb{Q}}",
      ),
    ).toEqual({ "\\R": "\\mathbb{R}" });
    // But \providecommand DOES define when nothing defined it yet.
    expect(extractMacros("\\providecommand{\\R}{\\mathbb{Q}}")).toEqual({
      "\\R": "\\mathbb{Q}",
    });
    // And a later \renewcommand still overrides a \providecommand.
    expect(
      extractMacros(
        "\\providecommand{\\R}{\\mathbb{Q}}\n\\renewcommand{\\R}{\\mathbb{R}}",
      ),
    ).toEqual({ "\\R": "\\mathbb{R}" });
  });

  it("last-wins across mixed forms, in source order (not by scanner)", () => {
    // \def first, \renewcommand later → LaTeX uses the later one.
    expect(
      extractMacros("\\def\\R{\\mathbb{Z}}\n\\renewcommand{\\R}{\\mathbb{R}}"),
    ).toEqual({ "\\R": "\\mathbb{R}" });
    // Reverse the order → the \def now wins because it comes later.
    expect(
      extractMacros("\\renewcommand{\\R}{\\mathbb{R}}\n\\def\\R{\\mathbb{Z}}"),
    ).toEqual({ "\\R": "\\mathbb{Z}" });
  });

  it("\\DeclareMathOperator (plain and starred)", () => {
    expect(extractMacros("\\DeclareMathOperator{\\Hom}{Hom}")).toEqual({
      "\\Hom": "\\operatorname{Hom}",
    });
    expect(extractMacros("\\DeclareMathOperator*{\\argmax}{arg\\,max}")).toEqual(
      { "\\argmax": "\\operatorname*{arg\\,max}" },
    );
  });

  it("\\def with and without params", () => {
    expect(extractMacros("\\def\\Z{\\mathbb{Z}}")).toEqual({
      "\\Z": "\\mathbb{Z}",
    });
    expect(extractMacros("\\def\\pair#1#2{(#1,#2)}")).toEqual({
      "\\pair": "(#1,#2)",
    });
  });

  it("nested braces in the body are balanced", () => {
    expect(extractMacros("\\newcommand{\\fr}{\\frac{a}{b}}")).toEqual({
      "\\fr": "\\frac{a}{b}",
    });
  });

  it("ignores definitions inside % comments", () => {
    expect(extractMacros("% \\newcommand{\\R}{\\mathbb{Q}}")).toEqual({});
    expect(extractMacros("100\\% \\newcommand{\\R}{X}")).toEqual({
      "\\R": "X",
    });
  });

  it("skips optional-argument defaults (fail-open)", () => {
    expect(
      extractMacros("\\newcommand{\\foo}[2][d]{#1#2}"),
    ).toEqual({});
  });

  it("only scans the preamble-style lines it understands, leaves prose alone", () => {
    const doc = [
      "\\documentclass{article}",
      "\\newcommand{\\R}{\\mathbb{R}}",
      "\\begin{document}",
      "Text with $x \\in \\R$ and \\textbf{bold}.",
      "\\end{document}",
    ].join("\n");
    expect(extractMacros(doc)).toEqual({ "\\R": "\\mathbb{R}" });
  });

  it("only scans the preamble — macros after \\begin{document} are ignored", () => {
    const doc = [
      "\\newcommand{\\R}{\\mathbb{R}}",
      "\\begin{document}",
      "\\newcommand{\\Q}{\\mathbb{Q}}", // in body — must be skipped
      "\\end{document}",
    ].join("\n");
    expect(extractMacros(doc)).toEqual({ "\\R": "\\mathbb{R}" });
  });

  it("a commented-out \\begin{document} does not cut the preamble short", () => {
    const doc = [
      "% \\begin{document}",
      "\\newcommand{\\R}{\\mathbb{R}}",
      "\\begin{document}",
      "\\end{document}",
    ].join("\n");
    expect(extractMacros(doc)).toEqual({ "\\R": "\\mathbb{R}" });
  });

  it("scans the full text when there is no \\begin{document} (fragment)", () => {
    expect(extractMacros("\\newcommand{\\R}{\\mathbb{R}}")).toEqual({
      "\\R": "\\mathbb{R}",
    });
  });
});

describe("mathToHtml with per-document macros", () => {
  it("a user macro renders (would otherwise be undefined)", () => {
    const macros = extractMacros("\\newcommand{\\myset}{\\{1,2,3\\}}");
    const { __html, err } = mathToHtml("\\myset", true, macros);
    expect(err).toBeUndefined();
    expect(__html).toContain("katex");
  });

  it("a user redefinition overrides KaTeX's built-in \\R", () => {
    // KaTeX builds \R as \mathbb{R}. Redefining it to \mathbb{Q} must
    // win, proving document macros take precedence over built-ins.
    const macros = extractMacros("\\renewcommand{\\R}{\\mathbb{Q}}");
    const withMacro = mathToHtml("\\R", true, macros).__html;
    const builtin = mathToHtml("\\R", true).__html;
    expect(withMacro).not.toEqual(builtin);
    // \mathbb{Q} renders as a double-struck Q; the built-in \R is a
    // double-struck R.
    expect(withMacro).toContain('double-struck">Q');
    expect(builtin).toContain('double-struck">R');
  });
});
