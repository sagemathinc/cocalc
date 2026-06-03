/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Extract user macro definitions from a .tex document so the rich-edit
KaTeX previews can render them — making the inline preview match the
real LaTeX compile (e.g. a preamble `\newcommand{\R}{\mathbb{R}}`).

Output is a KaTeX-compatible macro map: `{ "\\R": "\\mathbb{R}" }`.
KaTeX infers each macro's argument count from the `#1…#9` it references
in the expansion (same convention the static Sage macro map already
uses), so we do NOT need to track `[n]` arity ourselves.

Recognized forms:
  \newcommand{\name}{body}        \newcommand\name{body}
  \newcommand{\name}[k]{body}     \renewcommand / \providecommand (same)
  \newcommand*{...}               (star ignored)
  \DeclareMathOperator{\name}{op}      → \operatorname{op}
  \DeclareMathOperator*{\name}{op}     → \operatorname*{op}
  \def\name{body}    \def\name#1#2{body}

Deliberately skipped (fail-open — the formula renders with built-ins
only, as before): optional-argument defaults
(`\newcommand{\x}[2][d]{…}`), `\def` with delimited parameters, and
anything whose body braces don't balance.

This is a best-effort lexical scan, not a TeX parser: it strips `%`
comments (honoring `\%`) but does not understand `\verb`/verbatim
bodies. Defining macros inside verbatim is pathological and ignored.

Only the preamble (text before `\begin{document}`) is scanned, since
that is where user macros live in practice and it bounds the per-edit
cost to the prologue rather than the whole buffer. A document with no
`\begin{document}` (a fragment / snippet) is scanned in full.
*/

const NEWCOMMAND_RE = /\\(newcommand|renewcommand|providecommand)\*?\s*/g;
const DECLARE_OP_RE = /\\DeclareMathOperator(\*?)\s*/g;
const DEF_RE = /\\def\s*\\([A-Za-z@]+)/g;
const NAME_RE = /^\\([A-Za-z@]+)/;

/** One parsed macro definition, tagged with its source position so the
 * forms can be merged back in document order (last-wins, per LaTeX). */
interface MacroDef {
  /** Macro name including the leading backslash, e.g. `\\R`. */
  name: string;
  /** KaTeX-ready expansion body. */
  body: string;
  /** Start offset in the scanned text — used to apply source order. */
  index: number;
  /** `\providecommand`: only defines when the name is not already
   * defined at that point in source order (LaTeX keeps the existing
   * definition). Plain `\newcommand`/`\renewcommand`/`\def`/etc. are
   * unconditional. */
  provide?: boolean;
}

/** Read a `{…}` group starting at `text[i] === "{"`, brace-balanced,
 * honoring `\{` / `\}` escapes. Returns the inner body and the index
 * just past the closing brace, or null on imbalance. */
function readBraced(
  text: string,
  i: number,
): { body: string; end: number } | null {
  if (text[i] !== "{") return null;
  let depth = 1;
  let j = i + 1;
  while (j < text.length && depth > 0) {
    const c = text[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    j++;
  }
  if (depth !== 0) return null;
  return { body: text.slice(i + 1, j - 1), end: j };
}

/** Read a control-sequence name (`\foo`) at `text[i]`. */
function readName(text: string, i: number): { name: string; end: number } | null {
  const m = NAME_RE.exec(text.slice(i));
  if (m == null) return null;
  return { name: "\\" + m[1], end: i + m[0].length };
}

function skipWs(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/** Remove `%` comments (first unescaped `%` to end of line) per line. */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== "%") continue;
        let bs = 0;
        let j = i - 1;
        while (j >= 0 && line[j] === "\\") {
          bs++;
          j--;
        }
        if (bs % 2 === 0) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function scanNewcommands(text: string, defs: MacroDef[]): void {
  NEWCOMMAND_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NEWCOMMAND_RE.exec(text)) !== null) {
    const start = m.index;
    const provide = m[1] === "providecommand";
    let i = m.index + m[0].length;
    // Name: {\name} or bare \name.
    let name: string;
    if (text[i] === "{") {
      const br = readBraced(text, i);
      if (br == null) continue;
      name = br.body.trim();
      i = br.end;
    } else if (text[i] === "\\") {
      const nm = readName(text, i);
      if (nm == null) continue;
      name = nm.name;
      i = nm.end;
    } else {
      continue;
    }
    if (!/^\\[A-Za-z@]+$/.test(name)) continue;
    i = skipWs(text, i);
    // Optional [k] argument count (consumed; arity inferred from body).
    if (text[i] === "[") {
      const close = text.indexOf("]", i + 1);
      if (close === -1) continue;
      i = skipWs(text, close + 1);
      // A second bracket means an optional-argument DEFAULT — skip
      // these (KaTeX string macros don't model optional args well).
      if (text[i] === "[") continue;
    }
    if (text[i] !== "{") continue;
    const body = readBraced(text, i);
    if (body == null) continue;
    defs.push({ name, body: body.body, index: start, provide });
    NEWCOMMAND_RE.lastIndex = body.end;
  }
}

function scanDeclareOps(text: string, defs: MacroDef[]): void {
  DECLARE_OP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DECLARE_OP_RE.exec(text)) !== null) {
    const start = m.index;
    const star = m[1] === "*";
    let i = m.index + m[0].length;
    let name: string;
    if (text[i] === "{") {
      const br = readBraced(text, i);
      if (br == null) continue;
      name = br.body.trim();
      i = br.end;
    } else if (text[i] === "\\") {
      const nm = readName(text, i);
      if (nm == null) continue;
      name = nm.name;
      i = nm.end;
    } else {
      continue;
    }
    if (!/^\\[A-Za-z@]+$/.test(name)) continue;
    i = skipWs(text, i);
    if (text[i] !== "{") continue;
    const op = readBraced(text, i);
    if (op == null) continue;
    defs.push({
      name,
      body: `\\operatorname${star ? "*" : ""}{${op.body}}`,
      index: start,
    });
    DECLARE_OP_RE.lastIndex = op.end;
  }
}

function scanDefs(text: string, defs: MacroDef[]): void {
  DEF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DEF_RE.exec(text)) !== null) {
    const start = m.index;
    const name = "\\" + m[1];
    let i = m.index + m[0].length;
    // Parameter text up to the body brace: accept only simple #1#2…
    // patterns (KaTeX infers arity from the body's #n anyway).
    let params = "";
    while (i < text.length && text[i] !== "{") {
      params += text[i];
      i++;
    }
    if (text[i] !== "{") continue;
    if (params.trim() !== "" && !/^(#\d)+$/.test(params.trim())) continue;
    const body = readBraced(text, i);
    if (body == null) continue;
    defs.push({ name, body: body.body, index: start });
    DEF_RE.lastIndex = body.end;
  }
}

// Real LaTeX honors macro definitions wherever they appear, but in
// practice ~all user macros live in the preamble. Scanning only the
// preamble bounds the cost to the (small, ~constant) prologue instead
// of the whole buffer — the body can be megabytes and is re-scanned on
// every edit. The `\begin{document}` match runs on comment-stripped
// text so a commented-out marker doesn't cut the preamble short.
const BEGIN_DOCUMENT_RE = /\\begin\s*\{document\}/;

/**
 * Restrict `stripped` (already comment-stripped) text to the preamble —
 * everything before `\begin{document}`. Fail-open: if there is no
 * `\begin{document}` (a fragment, an `\input`-ed file, or a snippet),
 * return the whole text so macros are still found.
 */
function preambleOf(stripped: string): string {
  const m = BEGIN_DOCUMENT_RE.exec(stripped);
  return m == null ? stripped : stripped.slice(0, m.index);
}

/**
 * Parse all macro definitions from a document into a KaTeX-compatible
 * macro map. Later definitions override earlier ones (matching LaTeX's
 * last-wins for \renewcommand / \def). Only the preamble is scanned
 * (see `preambleOf`); documents with no `\begin{document}` are scanned
 * in full.
 */
export function extractMacros(text: string): Record<string, string> {
  const preamble = preambleOf(stripComments(text));
  const defs: MacroDef[] = [];
  scanNewcommands(preamble, defs);
  scanDeclareOps(preamble, defs);
  scanDefs(preamble, defs);
  // The scanners run one form at a time, so their relative order in the
  // source is lost. Re-sort by document position and apply ascending so
  // the LAST definition of a name wins regardless of form — matching
  // LaTeX (e.g. a later \renewcommand{\R} must override an earlier
  // \def\R, not the other way around because scanDefs ran last).
  defs.sort((a, b) => a.index - b.index);
  const out: Record<string, string> = {};
  for (const d of defs) {
    // \providecommand only defines when the name is not already defined
    // at this point in source order — LaTeX keeps the existing
    // definition. All other forms are unconditional last-wins.
    if (d.provide && d.name in out) continue;
    out[d.name] = d.body;
  }
  return out;
}
