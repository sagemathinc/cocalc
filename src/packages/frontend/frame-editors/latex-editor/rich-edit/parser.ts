/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Viewport-scoped LaTeX parser. Pure: given a CM editor and a line range,
returns the list of `WidgetDescriptor`s in document order. Same buffer
text → same descriptors, so the widget-manager can diff via
`marker.find()` against fresh descriptors.

Scope (Phase 5):
 - Single-arg brace-balanced commands: \textit \textbf \emph
   \underline \texttt \textsc \textsf \textrm \part \chapter \section
   \subsection \subsubsection \paragraph \subparagraph \url
 - Two-arg brace-balanced commands: \textcolor{color}{text}
   \href{url}{text}
 - Inline verbatim: \verb<DELIM>...<DELIM>
 - Math (single-line): $…$ \(…\) \[…\] $$…$$
 - Math envs (multi-line): \begin{equation|align|gather|multline}…
 - List envs (multi-line, nested-aware): \begin{itemize|enumerate|description}…
   emitted as three descriptor types: list-env-begin, list-env-end, list-item
 - Verbatim envs (multi-line): \begin{verbatim|Verbatim}…\end{…}

Out of scope (gaps in src/docs/latex-rich-edit-design.md):
 - Multi-line brace-balanced commands (we only scan line-by-line)
 - Nested constructs inside (rendered literally, not recursively)
 - Commands inside LaTeX comments (skip is a Phase 5.1 concern)
 - Math/list envs whose `\end{…}` is more than ENV_SEARCH_MAX_LINES
   below the viewport — env-search depth is capped to avoid
   degenerate scans
 - List envs whose `\begin{…}` is more than ENV_SCAN_LOOKBACK lines
   above the viewport without an intermediate `\end{…}`
*/

import * as CodeMirror from "codemirror";

import { FONT_SIZE_NAMES } from "./font-size";
import { WidgetDescriptor, WidgetType } from "./types";

/**
 * Minimal read-only line source so the parser can run without a live
 * CodeMirror instance (e.g. in unit tests). `parseViewport` adapts a
 * `CodeMirror.Editor` to this interface; the multi-line scanners that
 * previously read raw lines via `cm.getLine` / `cm.lineCount` now go
 * through it.
 *
 * Note: the few scanners that need the RAW (un-stripped) text of a
 * multi-line span use `getRangeFromSource` below rather than CM's
 * `getRange`, so they too work off a `LineSource`.
 */
export interface LineSource {
  getLine(line: number): string;
  lineCount(): number;
}

/**
 * Equivalent of `cm.getRange(from, to)` built purely from a
 * `LineSource`, joining intervening whole lines with `\n`. Used by the
 * multi-line scanners to capture raw widget source.
 */
function getRangeFromSource(
  src: LineSource,
  from: CodeMirror.Position,
  to: CodeMirror.Position,
): string {
  if (from.line === to.line) {
    return src.getLine(from.line).slice(from.ch, to.ch);
  }
  const parts: string[] = [src.getLine(from.line).slice(from.ch)];
  for (let l = from.line + 1; l < to.line; l++) {
    parts.push(src.getLine(l));
  }
  parts.push(src.getLine(to.line).slice(0, to.ch));
  return parts.join("\n");
}

const ENV_SEARCH_MAX_LINES = 500;
const ENV_SCAN_LOOKBACK = 200;
const BEGIN_RE = /\\begin\{([^}]+)\}/g;
const END_RE = /\\end\{([^}]+)\}/g;
// `\item` is a control word, so it must NOT be followed by another
// letter — otherwise `\itemsep`, `\itemindent`, `\itemize` (and the
// like, e.g. inside `\setlength{\itemsep}{0pt}`) would match the
// `\item` prefix, hide just that fragment, and be miscounted as list
// items. The negative lookahead requires a real token boundary; the
// optional `[label]` still follows for `\item[…]`.
const ITEM_RE = /\\item(?![a-zA-Z])(?:\[((?:[^\]\\]|\\.)*?)\])?/g;

const SINGLE_ARG_COMMANDS: ReadonlyArray<[string, WidgetType]> = [
  ["\\textit", "textit"],
  ["\\textbf", "textbf"],
  ["\\emph", "emph"],
  ["\\underline", "underline"],
  ["\\texttt", "texttt"],
  ["\\textsc", "textsc"],
  ["\\textsf", "textsf"],
  ["\\textrm", "textrm"],
  // `\textsuperscript` and `\textsubscript` are longer than the
  // others and don't collide with them on `indexOf` because
  // scanSingleArgCommand requires the very next char to be `{`.
  ["\\textsuperscript", "textsuperscript"],
  ["\\textsubscript", "textsubscript"],
  ["\\url", "url"],
  ["\\title", "title"],
  ["\\author", "author"],
  ["\\date", "date"],
  ["\\footnote", "footnote"],
  ["\\ref", "ref"],
  ["\\cite", "cite"],
  ["\\label", "label"],
  ["\\caption", "caption"],
  ["\\sout", "sout"],
  ["\\hl", "hl"],
  ["\\subparagraph", "subparagraph"],
  ["\\paragraph", "paragraph"],
  ["\\subsubsection", "subsubsection"],
  ["\\subsection", "subsection"],
  ["\\section", "section"],
  ["\\chapter", "chapter"],
  ["\\part", "part"],
];

const TWO_ARG_COMMANDS: ReadonlyArray<[string, WidgetType]> = [
  ["\\textcolor", "textcolor"],
  ["\\href", "href"],
];

// Zero-arg commands. Must be followed by a non-letter character (so
// `\maketitleFoo` doesn't match `\maketitle`). Order is irrelevant
// here because each command is scanned via `text.indexOf(command)`
// independently and the trailing letter-check rules out prefix
// collisions (e.g. `\TeX` can't match inside `\TeXer`).
const ZERO_ARG_COMMANDS: ReadonlyArray<[string, WidgetType]> = [
  ["\\maketitle", "maketitle"],
  ["\\tableofcontents", "tableofcontents"],
  ["\\LaTeX", "latex-glyph"],
  ["\\TeX", "tex-glyph"],
  // Structural / spacing — all share the same widget type and
  // distinguish themselves via payload.cmdName.
  //
  // Deliberately NOT widgeted:
  //  - `\\` (line break) — too common (every matrix row, tabular
  //    row, manual newline) → noisy as inline chips. Stays as raw
  //    source.
  //  - `\noindent` — marker for the FOLLOWING paragraph's indent;
  //    an inline chip mid-stream is more confusing than the literal
  //    `\noindent` text. Stays as raw source.
  ["\\newpage", "structural-command"],
  ["\\clearpage", "structural-command"],
  ["\\pagebreak", "structural-command"],
  ["\\linebreak", "structural-command"],
  ["\\bigskip", "structural-command"],
  ["\\medskip", "structural-command"],
  ["\\smallskip", "structural-command"],
];

const MATH_ENV_NAMES: ReadonlySet<string> = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
]);

const LIST_ENV_NAMES: ReadonlySet<string> = new Set([
  "itemize",
  "enumerate",
  "description",
]);

const VERBATIM_ENV_NAMES: ReadonlySet<string> = new Set([
  "verbatim",
  "Verbatim",
]);

const ABSTRACT_ENV_NAMES: ReadonlySet<string> = new Set(["abstract"]);

const THEOREM_ENV_NAMES: ReadonlySet<string> = new Set([
  "theorem",
  "lemma",
  "proof",
  "definition",
  "corollary",
  "proposition",
  "claim",
  "remark",
  "example",
  "note",
]);

const CODE_LISTING_ENV_NAMES: ReadonlySet<string> = new Set([
  "lstlisting",
  "minted",
]);

const TABULAR_ENV_NAMES: ReadonlySet<string> = new Set(["tabular"]);

/**
 * All command strings (including the leading `\`) that the parser
 * scans for explicitly — so the custom-macro fallback scanner can
 * skip them and not emit a competing descriptor. Built once at
 * module load.
 */
const KNOWN_COMMANDS: ReadonlySet<string> = new Set<string>([
  ...SINGLE_ARG_COMMANDS.map(([cmd]) => cmd),
  ...TWO_ARG_COMMANDS.map(([cmd]) => cmd),
  ...ZERO_ARG_COMMANDS.map(([cmd]) => cmd),
  // Special-cased commands that have their own scanners:
  "\\includegraphics",
  "\\verb",
  "\\verb*",
  // Env delimiters — not real macros from the user's POV.
  "\\begin",
  "\\end",
]);

/**
 * Commands the custom-macro scanner deliberately leaves alone even
 * though they look like `\cmd{…}`. Mostly preamble / configuration
 * stuff where the user is editing structured data, not authoring
 * prose. A chip would just get in the way.
 *
 * Math-mode commands (`\frac{…}{…}`, `\sqrt{…}`, etc.) don't need
 * to be listed here — they live inside math widgets, which subsume
 * inner descriptors via dropOverlaps. Same for verbatim/lstlisting
 * (handled via `protectedRanges`).
 */
const CUSTOM_MACRO_SKIP: ReadonlySet<string> = new Set<string>([
  // Document setup
  "\\documentclass",
  "\\usepackage",
  "\\RequirePackage",
  // Macro / environment definitions
  "\\newcommand",
  "\\renewcommand",
  "\\providecommand",
  "\\newenvironment",
  "\\renewenvironment",
  "\\newtheorem",
  "\\DeclareMathOperator",
  "\\DeclareGraphicsExtensions",
  "\\DeclareRobustCommand",
  // Counter / length tweaks
  "\\setlength",
  "\\addtolength",
  "\\setcounter",
  "\\addtocounter",
  "\\stepcounter",
  "\\refstepcounter",
  // Bibliography / cross-file
  "\\bibliographystyle",
  "\\bibliography",
  "\\addbibresource",
  "\\nocite",
  "\\input",
  "\\include",
  "\\includeonly",
  // Page style
  "\\thispagestyle",
  "\\pagestyle",
  "\\pagenumbering",
  // Geometry / hyperref configuration
  "\\geometry",
  "\\hypersetup",
  "\\definecolor",
  "\\colorlet",
  // Language / font
  "\\selectlanguage",
  "\\fontsize",
  "\\fontfamily",
  "\\usefont",
]);

/**
 * True iff the token at `idx` is escaped by an ODD run of immediately-
 * preceding backslashes. A single `\` before it escapes it (`\$`);
 * `\\` (an escaped backslash, e.g. a line break) does NOT escape the
 * following token (`\\\[` is a line break then real display math).
 * Mirrors the parity logic in `stripComment`.
 */
function isEscaped(text: string, idx: number): boolean {
  let bs = 0;
  let j = idx - 1;
  while (j >= 0 && text[j] === "\\") {
    bs++;
    j--;
  }
  return bs % 2 === 1;
}

/**
 * Return the line with any LaTeX-style comment (first unescaped `%`
 * to end of line) removed. The escaping rule walks back from the
 * `%`: an odd number of preceding consecutive `\` means the `%` is
 * literal (e.g. `\%`), even (including zero) means it starts a
 * comment (e.g. `%`, `\\%`, `\\\\%`).
 *
 * Limitations (acceptable trade-offs):
 *  - `\verb<DELIM>…<DELIM>` with a `%` between the delimiters will
 *    NOT render as a widget (the helper truncates at the `%` and
 *    scanVerb then sees no closing delimiter). Trade-off: rare
 *    construct vs. needing a full TeX-aware lexer to handle it
 *    correctly.
 *  - Verbatim-env bodies (where `%` is literal in real LaTeX) get
 *    stripped here too, so a literal `% \end{verbatim}` inside a
 *    verbatim body would be misread (we'd skip it and pair with a
 *    later end). The descriptor list inside verbatim bodies is
 *    dropped via `protectedRanges` anyway, but the env's extent
 *    could be wrong. Documented edge case — users almost never
 *    write that.
 */
function stripComment(text: string): string {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "%") continue;
    let bs = 0;
    let j = i - 1;
    while (j >= 0 && text[j] === "\\") {
      bs++;
      j--;
    }
    if (bs % 2 === 0) return text.slice(0, i);
  }
  return text;
}

/**
 * Read a CM line and strip any `%` comment tail. Convenience wrapper
 * for the multi-line scanners (env-stack walk, `\[…\]`, `$$…$$`,
 * math envs) so they don't pair `% \begin{verbatim}` or `% \[` etc.
 * with a real closing delimiter further down.
 *
 * Widget *bodies* are still captured via `cm.getRange(from, to)` on
 * the raw buffer, so e.g. a math env containing a `%` comment will
 * pass that raw text to KaTeX (which handles `%` comments in math
 * mode correctly).
 */
function getLineStripped(src: LineSource, line: number): string {
  return stripComment(src.getLine(line));
}

function findMatchingBrace(text: string, openCh: number): number {
  let depth = 1;
  let j = openCh + 1;
  while (j < text.length && depth > 0) {
    const ch = text[j];
    if (ch === "\\" && j + 1 < text.length) {
      j += 2;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    j++;
  }
  return depth === 0 ? j - 1 : -1;
}

/**
 * Starting at `i` (just past a command token), skip a run of that
 * command's argument groups — brace-balanced `{…}` and optional `[…]`,
 * allowing whitespace between them — and return the index just past the
 * last one. Used to swallow the WHOLE of a skip-list definition command
 * (e.g. `\newcommand{\R}{\mathbb{R}}`) so the custom-macro scanner
 * doesn't descend into the body. On an unbalanced group it returns
 * `text.length` (skip the rest of the line — it's malformed anyway).
 */
function skipArgGroups(text: string, i: number): number {
  while (i < text.length) {
    let j = i;
    while (j < text.length && /\s/.test(text[j])) j++;
    const c = text[j];
    if (c === "{") {
      const close = findMatchingBrace(text, j);
      if (close === -1) return text.length;
      i = close + 1;
    } else if (c === "[") {
      const close = text.indexOf("]", j + 1);
      if (close === -1) return text.length;
      i = close + 1;
    } else {
      break;
    }
  }
  return i;
}

function scanSingleArgCommand(
  text: string,
  line: number,
  command: string,
  type: WidgetType,
  out: WidgetDescriptor[],
): void {
  let i = 0;
  while (true) {
    const idx = text.indexOf(command, i);
    if (idx === -1) break;
    if (isEscaped(text, idx)) {
      i = idx + command.length;
      continue;
    }
    let after = idx + command.length;
    let starred = false;
    if (text[after] === "*") {
      starred = true;
      after++;
    }
    if (text[after] !== "{") {
      i = idx + command.length;
      continue;
    }
    const closeIdx = findMatchingBrace(text, after);
    if (closeIdx === -1) break;
    const toCh = closeIdx + 1;
    out.push({
      type,
      from: { line, ch: idx },
      to: { line, ch: toCh },
      source: text.slice(idx, toCh),
      payload: { content: text.slice(after + 1, closeIdx), starred },
    });
    i = toCh;
  }
}

function scanTwoArgCommand(
  text: string,
  line: number,
  command: string,
  type: WidgetType,
  out: WidgetDescriptor[],
): void {
  let i = 0;
  while (true) {
    const idx = text.indexOf(command, i);
    if (idx === -1) break;
    if (isEscaped(text, idx)) {
      i = idx + command.length;
      continue;
    }
    const after = idx + command.length;
    if (text[after] !== "{") {
      i = idx + command.length;
      continue;
    }
    const close1 = findMatchingBrace(text, after);
    if (close1 === -1) break;
    let next = close1 + 1;
    while (next < text.length && /\s/.test(text[next])) next++;
    if (text[next] !== "{") {
      i = close1 + 1;
      continue;
    }
    const close2 = findMatchingBrace(text, next);
    if (close2 === -1) break;
    out.push({
      type,
      from: { line, ch: idx },
      to: { line, ch: close2 + 1 },
      source: text.slice(idx, close2 + 1),
      payload: {
        arg1: text.slice(after + 1, close1),
        arg2: text.slice(next + 1, close2),
      },
    });
    i = close2 + 1;
  }
}

/**
 * Zero-arg command (e.g. `\maketitle`). Must be terminated by a
 * non-letter character so `\maketitleFoo` doesn't match.
 */
function scanZeroArgCommand(
  text: string,
  line: number,
  command: string,
  type: WidgetType,
  out: WidgetDescriptor[],
): void {
  let i = 0;
  while (true) {
    const idx = text.indexOf(command, i);
    if (idx === -1) break;
    if (isEscaped(text, idx)) {
      i = idx + command.length;
      continue;
    }
    const after = idx + command.length;
    if (after < text.length && /[A-Za-z]/.test(text[after])) {
      i = idx + command.length;
      continue;
    }
    out.push({
      type,
      from: { line, ch: idx },
      to: { line, ch: after },
      source: command,
      // Include the literal command so widgets that handle multiple
      // commands (e.g. the structural-command family) can branch on
      // it. Existing single-purpose widgets ignore the payload.
      payload: { cmdName: command },
    });
    i = after;
  }
}

/**
 * Catch-all scanner for unknown `\cmd{…}` patterns: any `\name{body}`
 * where `name` is letters-only AND `\name` isn't in `KNOWN_COMMANDS`
 * AND isn't in `CUSTOM_MACRO_SKIP`. Emits a `custom-macro` descriptor
 * so the widget can render a neutral chip with hover-source.
 *
 * Notes
 * -----
 *  - Optional bracket args (`\cmd[opt]{body}`) are NOT handled in v1
 *    — those fall through to raw source. Same for zero-arg unknown
 *    commands. The point of this scanner is to clean up the most
 *    common visual noise (`\foo{some content}` chunks); covering
 *    every macro form would need a full TeX-aware lexer.
 *  - Math-mode commands stay rendered by KaTeX because the math
 *    widget's covering descriptor subsumes anything inside it via
 *    `dropOverlaps`. Verbatim / lstlisting bodies are filtered out
 *    via `protectedRanges`. So inside-math/inside-code don't need
 *    to be in the skip list.
 */
/**
 * Braced font-size groups: `{\Large …}`, `{\small …}`, etc. — the
 * self-delimited form only. We match a `{` (not escaped) optionally
 * followed by whitespace, then a size command whose name is in
 * `FONT_SIZE_NAMES` and is a complete token (the next char is not a
 * letter, so `\Largex` doesn't match `\Large`). The body is everything
 * after the size declaration up to the matching `}`.
 *
 * Bare declarations (`\Large` with no braces) are intentionally NOT
 * handled — see font-size.ts. False positives where the `{` is actually
 * another command's argument brace (e.g. `\section{\Large T}`) are
 * removed by dropOverlaps, since that command's covering descriptor is
 * wider.
 */
function scanFontSizeGroup(
  text: string,
  line: number,
  out: WidgetDescriptor[],
): void {
  const RE = /\{\s*\\([A-Za-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    const braceOpen = m.index;
    if (isEscaped(text, braceOpen)) continue;
    const sizeName = m[1];
    if (!FONT_SIZE_NAMES.has(sizeName)) continue;
    const afterName = m.index + m[0].length;
    // Require a token boundary after the size command name.
    if (/[A-Za-z]/.test(text[afterName] ?? "")) continue;
    const close = findMatchingBrace(text, braceOpen);
    if (close === -1) continue;
    // Body = content after the size declaration (and the single
    // gobbled space LaTeX drops after a control word) up to the `}`.
    let cs = afterName;
    while (cs < close && /\s/.test(text[cs])) cs++;
    out.push({
      type: "font-size",
      from: { line, ch: braceOpen },
      to: { line, ch: close + 1 },
      source: text.slice(braceOpen, close + 1),
      payload: { sizeName, content: text.slice(cs, close) },
    });
    RE.lastIndex = close + 1;
  }
}

function scanCustomMacro(
  text: string,
  line: number,
  out: WidgetDescriptor[],
): void {
  // `\name` followed by optional whitespace then `{`. Letters-only
  // command name; LaTeX allows `*` suffix for some commands but we
  // skip those (would require per-command knowledge).
  const RE = /\\([A-Za-z]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    const cmdStart = m.index;
    if (isEscaped(text, cmdStart)) continue;
    const cmdName = "\\" + m[1];
    // KNOWN_COMMANDS are handled by their own scanners, which emit a
    // covering descriptor that dropOverlaps uses to remove any inner
    // custom-macro hit, so a plain token-skip is enough here.
    if (KNOWN_COMMANDS.has(cmdName)) continue;
    // Skip-list commands (\newcommand, \setlength, \definecolor, …)
    // emit NO covering descriptor, so we must advance past their whole
    // argument list — otherwise the scanner descends into the body and
    // emits a stray chip for e.g. \mathbb{R} inside
    // \newcommand{\R}{\mathbb{R}}.
    if (CUSTOM_MACRO_SKIP.has(cmdName)) {
      RE.lastIndex = skipArgGroups(text, cmdStart + cmdName.length);
      continue;
    }
    // `m[0]` ends with `{` (possibly with whitespace before it).
    // The `{` itself is the last char of the match.
    const braceOpen = cmdStart + m[0].length - 1;
    const close = findMatchingBrace(text, braceOpen);
    if (close === -1) continue;
    out.push({
      type: "custom-macro",
      from: { line, ch: cmdStart },
      to: { line, ch: close + 1 },
      source: text.slice(cmdStart, close + 1),
      payload: {
        cmdName,
        content: text.slice(braceOpen + 1, close),
      },
    });
    RE.lastIndex = close + 1;
  }
}

/**
 * `\includegraphics[opts]{path}` — optional bracket args. The
 * options string is captured for the widget to parse (we look for
 * `width=…` only in v0.1; everything else is preserved on hover-
 * source but not honored visually).
 */
function scanIncludegraphics(
  text: string,
  line: number,
  out: WidgetDescriptor[],
): void {
  const cmd = "\\includegraphics";
  let i = 0;
  while (true) {
    const idx = text.indexOf(cmd, i);
    if (idx === -1) break;
    if (isEscaped(text, idx)) {
      i = idx + cmd.length;
      continue;
    }
    let after = idx + cmd.length;
    let options = "";
    if (text[after] === "[") {
      const closeOpt = text.indexOf("]", after + 1);
      if (closeOpt === -1) break;
      options = text.slice(after + 1, closeOpt);
      after = closeOpt + 1;
    }
    if (text[after] !== "{") {
      i = idx + cmd.length;
      continue;
    }
    const closeArg = findMatchingBrace(text, after);
    if (closeArg === -1) break;
    const path = text.slice(after + 1, closeArg);
    const to = closeArg + 1;
    out.push({
      type: "includegraphics",
      from: { line, ch: idx },
      to: { line, ch: to },
      source: text.slice(idx, to),
      payload: { path, options },
    });
    i = to;
  }
}

function scanVerb(text: string, line: number, out: WidgetDescriptor[]): void {
  const VERB = "\\verb";
  let i = 0;
  while (true) {
    const idx = text.indexOf(VERB, i);
    if (idx === -1) break;
    if (isEscaped(text, idx)) {
      i = idx + VERB.length;
      continue;
    }
    let after = idx + VERB.length;
    let starred = false;
    if (text[after] === "*") {
      starred = true;
      after++;
    }
    const delim = text[after];
    if (delim == null || /[A-Za-z\s]/.test(delim) || delim === "*") {
      i = idx + VERB.length;
      continue;
    }
    const end = text.indexOf(delim, after + 1);
    if (end === -1) {
      i = idx + VERB.length;
      continue;
    }
    out.push({
      type: "verb",
      from: { line, ch: idx },
      to: { line, ch: end + 1 },
      source: text.slice(idx, end + 1),
      payload: { content: text.slice(after + 1, end), delim, starred },
    });
    i = end + 1;
  }
}

/**
 * Inline `$…$` math on a single line. `$$…$$` (display) and
 * multi-line forms are handled by `scanDoubleDollarMath` and
 * `scanBracketDisplayMath`, which run BEFORE this scanner and emit
 * outer descriptors that `dropOverlaps` uses to subsume any inner
 * matches we might emit here.
 */
function scanInlineDollarMath(
  text: string,
  line: number,
  out: WidgetDescriptor[],
): void {
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] !== "$") {
      i++;
      continue;
    }
    if (text[i + 1] === "$") {
      // Inside or adjacent to a `$$` — skip past it; the multi-line
      // scanner has either already emitted the outer descriptor (so
      // dropOverlaps will subsume us) or there's no matching `$$`
      // (so we don't want to misread it as two empty $…$ matches).
      i += 2;
      continue;
    }
    let j = i + 1;
    while (j < text.length) {
      if (text[j] === "\\") {
        j += 2;
        continue;
      }
      if (text[j] === "$") break;
      j++;
    }
    if (j >= text.length) break;
    const content = text.slice(i + 1, j);
    if (content.length > 0) {
      out.push({
        type: "math-inline",
        from: { line, ch: i },
        to: { line, ch: j + 1 },
        source: text.slice(i, j + 1),
        payload: { content },
      });
    }
    i = j + 1;
  }
}

/**
 * Multi-line (or single-line) `\[…\]` display math. Scans for an
 * opening `\[` and walks forward — same line first, then subsequent
 * lines up to ENV_SEARCH_MAX_LINES — to find the matching `\]`.
 */
function scanBracketDisplayMath(
  src: LineSource,
  fromLine: number,
  toLine: number,
  out: WidgetDescriptor[],
): void {
  const lineCount = src.lineCount();
  const maxSearchLine = Math.min(lineCount, toLine + ENV_SEARCH_MAX_LINES);
  for (let line = fromLine; line < toLine; line++) {
    const text = getLineStripped(src, line);
    let i = 0;
    while (true) {
      const idx = text.indexOf("\\[", i);
      if (idx === -1) break;
      if (isEscaped(text, idx)) {
        i = idx + 2;
        continue;
      }
      // Find matching `\]` — same line first.
      let foundLine = -1;
      let foundCh = -1;
      const sameIdx = text.indexOf("\\]", idx + 2);
      if (sameIdx !== -1) {
        foundLine = line;
        foundCh = sameIdx;
      } else {
        for (let l = line + 1; l <= maxSearchLine; l++) {
          const t = getLineStripped(src, l);
          const fIdx = t.indexOf("\\]");
          if (fIdx !== -1) {
            foundLine = l;
            foundCh = fIdx;
            break;
          }
        }
      }
      if (foundLine === -1) {
        i = idx + 2;
        continue;
      }
      const from = { line, ch: idx };
      const to = { line: foundLine, ch: foundCh + 2 };
      const content = getRangeFromSource(
        src,
        { line, ch: idx + 2 },
        { line: foundLine, ch: foundCh },
      );
      out.push({
        type: "math-display",
        from,
        to,
        source: getRangeFromSource(src, from, to),
        payload: { content },
      });
      // Continue past this match on the same line; multi-line
      // matches break out of the per-line loop.
      if (foundLine === line) {
        i = foundCh + 2;
      } else {
        break;
      }
    }
  }
}

/**
 * Multi-line (or single-line) `$$…$$` display math. Same shape as
 * `scanBracketDisplayMath`. The `$$` delimiter is symmetric, so we
 * have to walk char-by-char and honor `\$` escapes.
 */
function scanDoubleDollarMath(
  src: LineSource,
  fromLine: number,
  toLine: number,
  out: WidgetDescriptor[],
): void {
  const lineCount = src.lineCount();
  const maxSearchLine = Math.min(lineCount, toLine + ENV_SEARCH_MAX_LINES);
  const findDoubleDollar = (text: string, start: number): number => {
    let k = start;
    while (k < text.length - 1) {
      if (text[k] === "\\") {
        k += 2;
        continue;
      }
      if (text[k] === "$" && text[k + 1] === "$") return k;
      k++;
    }
    return -1;
  };
  for (let line = fromLine; line < toLine; line++) {
    const text = getLineStripped(src, line);
    let i = 0;
    while (i < text.length - 1) {
      if (text[i] === "\\") {
        i += 2;
        continue;
      }
      if (text[i] !== "$" || text[i + 1] !== "$") {
        i++;
        continue;
      }
      // Found opening `$$`.
      let foundLine = -1;
      let foundCh = -1;
      const sameIdx = findDoubleDollar(text, i + 2);
      if (sameIdx !== -1) {
        foundLine = line;
        foundCh = sameIdx;
      } else {
        for (let l = line + 1; l <= maxSearchLine; l++) {
          const t = getLineStripped(src, l);
          const fIdx = findDoubleDollar(t, 0);
          if (fIdx !== -1) {
            foundLine = l;
            foundCh = fIdx;
            break;
          }
        }
      }
      if (foundLine === -1) {
        i += 2;
        continue;
      }
      const from = { line, ch: i };
      const to = { line: foundLine, ch: foundCh + 2 };
      const content = getRangeFromSource(
        src,
        { line, ch: i + 2 },
        { line: foundLine, ch: foundCh },
      );
      if (content.trim().length > 0) {
        out.push({
          type: "math-display",
          from,
          to,
          source: getRangeFromSource(src, from, to),
          payload: { content },
        });
      }
      if (foundLine === line) {
        i = foundCh + 2;
      } else {
        break;
      }
    }
  }
}

function scanParenMath(
  text: string,
  line: number,
  out: WidgetDescriptor[],
): void {
  let i = 0;
  while (true) {
    const idx = text.indexOf("\\(", i);
    if (idx === -1) break;
    if (isEscaped(text, idx)) {
      i = idx + 2;
      continue;
    }
    const end = text.indexOf("\\)", idx + 2);
    if (end === -1) {
      i = idx + 2;
      continue;
    }
    out.push({
      type: "math-inline",
      from: { line, ch: idx },
      to: { line, ch: end + 2 },
      source: text.slice(idx, end + 2),
      payload: { content: text.slice(idx + 2, end) },
    });
    i = end + 2;
  }
}

function scanMathEnvs(
  src: LineSource,
  fromLine: number,
  toLine: number,
  out: WidgetDescriptor[],
): void {
  const lineCount = src.lineCount();
  const maxSearchLine = Math.min(lineCount, toLine + ENV_SEARCH_MAX_LINES);
  for (let line = fromLine; line < toLine; line++) {
    const text = getLineStripped(src, line);
    BEGIN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BEGIN_RE.exec(text)) !== null) {
      const envName = m[1];
      if (!MATH_ENV_NAMES.has(envName)) continue;
      const beginCh = m.index;
      const endStr = `\\end{${envName}}`;
      let foundLine = -1;
      let foundEndCh = -1;
      const sameIdx = text.indexOf(endStr, beginCh + m[0].length);
      if (sameIdx !== -1) {
        foundLine = line;
        foundEndCh = sameIdx + endStr.length;
      } else {
        for (let l = line + 1; l <= maxSearchLine; l++) {
          const t = getLineStripped(src, l);
          const idx = t.indexOf(endStr);
          if (idx !== -1) {
            foundLine = l;
            foundEndCh = idx + endStr.length;
            break;
          }
        }
      }
      if (foundLine === -1) continue;
      const from = { line, ch: beginCh };
      const to = { line: foundLine, ch: foundEndCh };
      out.push({
        type: "math-env",
        from,
        to,
        source: getRangeFromSource(src, from, to),
        payload: { envName },
      });
    }
  }
}

// ---------- Tabular parser (fail-open) ----------

/** One column's horizontal alignment from the colspec. */
export type TabularAlign = "l" | "c" | "r" | "p";

export type TabularRow = { kind: "row"; cells: string[] } | { kind: "border" };

export interface TabularData {
  alignments: TabularAlign[];
  rows: TabularRow[];
}

/**
 * Parse a tabular colspec like `|l|c|r|`, `lcr`, `l@{}p{3cm}>{\bfseries}c`.
 * Recognized:
 *   - `l` `c` `r` — alignment columns
 *   - `p{…}` / `m{…}` / `b{…}` — paragraph columns (we collapse to "p")
 *   - `|` — vertical rule (consumed, no column)
 *   - `@{…}` / `>{…}` / `<{…}` — prefix/suffix decorators (consumed)
 * Returns null on anything we don't recognize (e.g. `*{n}{…}` repeats,
 * `X` from tabularx, exotic combinators) — fail-open.
 */
function parseColspec(spec: string): TabularAlign[] | null {
  const result: TabularAlign[] = [];
  let i = 0;
  while (i < spec.length) {
    const ch = spec[i];
    if (ch === "l" || ch === "c" || ch === "r") {
      result.push(ch);
      i++;
    } else if (ch === "p" || ch === "m" || ch === "b") {
      // Paragraph-style column with required `{width}`.
      result.push("p");
      i++;
      while (i < spec.length && /\s/.test(spec[i])) i++;
      if (spec[i] !== "{") return null;
      const close = findMatchingBrace(spec, i);
      if (close === -1) return null;
      i = close + 1;
    } else if (ch === "|") {
      i++;
    } else if (ch === "@" || ch === ">" || ch === "<") {
      // Decorator with required `{content}`.
      i++;
      while (i < spec.length && /\s/.test(spec[i])) i++;
      if (spec[i] !== "{") return null;
      const close = findMatchingBrace(spec, i);
      if (close === -1) return null;
      i = close + 1;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      // Anything else (X, *, !, …) — bail.
      return null;
    }
  }
  return result;
}

/**
 * Split tabular body text into top-level (depth-0 of `{}`) row
 * separators (`\\`) and cell separators (`&`), honoring `\\&` escape
 * for `&` and the same backslash-counting rule as `\%` for `\\`.
 *
 * Caveats:
 *  - Tracks `{}` depth so `\foo{a & b}` keeps its content together.
 *  - Doesn't track `$…$` math regions. A literal `&` inside `$…$`
 *    would split into a new cell here even though LaTeX wouldn't.
 *    Math cell content is rare in tabular bodies (you'd use array
 *    instead), so we accept this gap.
 *  - `\multicolumn{n}{c}{…}` is left alone by the splitter (its `&`
 *    chars are inside braces) but the resulting cell count won't
 *    match the colspec — the caller returns null in that case so
 *    the table fails open.
 */
function parseTabularBody(
  body: string,
  expectedCols: number,
): TabularRow[] | null {
  // 1) Find top-level `\\` positions. Half-open row separators.
  const sepPositions: number[] = [];
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (ch === "\\" && i + 1 < body.length) {
      if (body[i + 1] === "\\" && depth === 0) {
        sepPositions.push(i);
        i++; // consume the second backslash
        continue;
      }
      // Any other `\x` — skip the escaped char so e.g. `\&` doesn't
      // split as a cell sep, `\{` doesn't open a brace.
      i++;
    }
  }
  // 2) Slice body into row segments, advancing past `\\` plus
  //    optional `*` and `[…]` after each.
  const rowSegments: string[] = [];
  let prev = 0;
  for (const pos of sepPositions) {
    rowSegments.push(body.slice(prev, pos));
    let after = pos + 2;
    if (body[after] === "*") after++;
    while (after < body.length && /\s/.test(body[after])) after++;
    if (body[after] === "[") {
      const close = body.indexOf("]", after + 1);
      if (close !== -1) after = close + 1;
    }
    prev = after;
  }
  rowSegments.push(body.slice(prev));

  // 3) For each segment: extract leading \hline / \toprule / etc.
  //    as border rows, then split remaining content by top-level `&`.
  const rows: TabularRow[] = [];
  const HRULE_RE =
    /^(\\hline|\\toprule|\\midrule|\\bottomrule|\\cline\{[^}]*\})\s*/;
  for (const seg of rowSegments) {
    let work = seg.trim();
    while (true) {
      const m = HRULE_RE.exec(work);
      if (m == null) break;
      rows.push({ kind: "border" });
      work = work.slice(m[0].length).trim();
    }
    if (work === "") continue;
    // Bail-out: \multicolumn isn't honored, would mess up the count.
    if (/\\multicolumn\b/.test(work) || /\\multirow\b/.test(work)) {
      return null;
    }
    // Split work by top-level `&`.
    const cells: string[] = [];
    let cellStart = 0;
    let cellDepth = 0;
    let i = 0;
    while (i < work.length) {
      const ch = work[i];
      if (ch === "{") {
        cellDepth++;
        i++;
      } else if (ch === "}") {
        cellDepth--;
        i++;
      } else if (ch === "\\" && i + 1 < work.length) {
        i += 2; // skip escaped char (`\&`, `\{`, `\%`, etc.)
      } else if (ch === "&" && cellDepth === 0) {
        cells.push(work.slice(cellStart, i).trim());
        cellStart = i + 1;
        i++;
      } else {
        i++;
      }
    }
    cells.push(work.slice(cellStart).trim());
    if (cells.length !== expectedCols) return null;
    rows.push({ kind: "row", cells });
  }
  if (rows.length === 0) return null;
  return rows;
}

/**
 * Parse a tabular env's full source (`\begin{tabular}…\end{tabular}`)
 * into a structured `TabularData`. Returns null if anything looks off
 * — colspec failure, brace imbalance, column count mismatch,
 * `\multicolumn` present, etc. — so the caller can fall back to
 * leaving the source raw (no widget).
 *
 * Optional `[pos]` argument after `\begin{tabular}` (top/bottom/center
 * alignment) is consumed and ignored.
 */
function parseTabular(source: string, envName: string): TabularData | null {
  const beginPat = `\\begin{${envName}}`;
  const beginIdx = source.indexOf(beginPat);
  if (beginIdx < 0) return null;
  let i = beginIdx + beginPat.length;
  while (i < source.length && /\s/.test(source[i])) i++;
  // Optional [pos]
  if (source[i] === "[") {
    const close = source.indexOf("]", i + 1);
    if (close < 0) return null;
    i = close + 1;
    while (i < source.length && /\s/.test(source[i])) i++;
  }
  // Required {colspec}
  if (source[i] !== "{") return null;
  const colspecClose = findMatchingBrace(source, i);
  if (colspecClose < 0) return null;
  const colspec = source.slice(i + 1, colspecClose);
  const alignments = parseColspec(colspec);
  if (alignments == null || alignments.length === 0) return null;
  // Find \end{envName}.
  const endPat = `\\end{${envName}}`;
  const endIdx = source.lastIndexOf(endPat);
  if (endIdx <= colspecClose) return null;
  const body = source.slice(colspecClose + 1, endIdx);
  const rows = parseTabularBody(body, alignments.length);
  if (rows == null) return null;
  return { alignments, rows };
}

/**
 * Scan a window from `startLine` to `maxSearchLine` for list and
 * verbatim envs, with proper nested-env-stack tracking.
 *
 * Strategy: walk lines, collect (begin|end|item) events in document
 * order, maintain an env stack. When a balanced pair is closed:
 *  - For list envs, emit `list-env-begin`, `list-env-end`, and
 *    `list-item` descriptors (one per `\item` in the body), only
 *    for descriptors whose line is within [fromLine, toLine).
 *  - For verbatim envs, emit a single multi-line `verbatim-env`
 *    descriptor when its begin is in the viewport.
 *
 * Unbalanced envs at end of scan emit nothing — fail-open per the
 * design doc.
 *
 * `protectedRanges` (output): half-open `[from, to)` line ranges
 * covering the bodies of verbatim AND code-listing envs (anything
 * where the body should be treated as raw text, not parsed for
 * LaTeX). `parseViewport` uses this to drop any descriptor whose
 * `from.line` falls inside one of these ranges. This catches the
 * case where a verbatim begins above the (expanded) viewport but
 * the body extends into it — there's no covering descriptor to
 * suppress inner widgets via `dropOverlaps`, so we need the
 * explicit filter.
 *
 * Approximations:
 *  - We only scan back `ENV_SCAN_LOOKBACK` lines, so a list env
 *    whose `\begin{…}` is more than 200 lines above the viewport
 *    (without an intermediate `\end{…}` reset) is missed. Typical
 *    docs don't have lists that long.
 *  - LaTeX accepts mismatched env names as an error (and tries to
 *    recover); we silently ignore unmatched `\end{…}`.
 */
function scanEnvBlocks(
  src: LineSource,
  fromLine: number,
  toLine: number,
  out: WidgetDescriptor[],
  protectedRanges: Array<{ from: number; to: number }>,
): void {
  interface StackEntry {
    envName: string;
    beginLine: number;
    beginCh: number;
    beginEndCh: number;
    source: string;
    /**
     * For list envs only: nesting depth counted in list envs only
     * (NOT all envs). Outermost list = 0; first nested list = 1; etc.
     * Used by the ListItem widget to pick the appropriate marker
     * style (`1.` / `a.` / `i.` / `A.` for enumerate;
     * `•` / `–` / `*` / `·` for itemize), matching the LaTeX
     * defaults. Non-list envs leave this `undefined`.
     */
    listDepth?: number;
    /** For list envs: collected items, in document order. */
    items: Array<{
      line: number;
      ch: number;
      endCh: number;
      label: string | null;
      source: string;
    }> | null;
  }

  const lineCount = src.lineCount();
  const startLine = Math.max(0, fromLine - ENV_SCAN_LOOKBACK);
  const maxSearchLine = Math.min(lineCount, toLine + ENV_SEARCH_MAX_LINES);

  const stack: StackEntry[] = [];

  // Raw-text envs (verbatim / Verbatim / lstlisting / minted) treat
  // their body as OPAQUE: literal `\begin{…}` / `\end{…}` / `\item`
  // text inside them must not perturb the env stack. While such an
  // env is the top of stack, we skip event collection for body lines
  // and only look for the literal matching `\end{<thatenv>}` to close
  // it. Other env families (lists, theorem, tabular, math) keep their
  // existing nested-scan behavior.
  const isRawTextEnv = (envName: string): boolean =>
    VERBATIM_ENV_NAMES.has(envName) || CODE_LISTING_ENV_NAMES.has(envName);

  type Event =
    | {
        kind: "begin";
        envName: string;
        ch: number;
        endCh: number;
        source: string;
      }
    | {
        kind: "end";
        envName: string;
        ch: number;
        endCh: number;
        source: string;
      }
    | {
        kind: "item";
        ch: number;
        endCh: number;
        label: string | null;
        source: string;
      };

  for (let line = startLine; line <= maxSearchLine; line++) {
    const text = getLineStripped(src, line);
    const events: Event[] = [];

    // When the top of stack is a raw-text env (verbatim / Verbatim /
    // lstlisting / minted), the body is OPAQUE: do not scan for any
    // begin/end/item tokens except the literal matching
    // `\end{<thatenv>}` that closes it. This keeps embedded literal
    // LaTeX (e.g. `\end{verbatim}` printed inside an lstlisting body)
    // from corrupting the env stack.
    const topEnv = stack.length > 0 ? stack[stack.length - 1] : null;
    if (topEnv != null && isRawTextEnv(topEnv.envName)) {
      const endStr = `\\end{${topEnv.envName}}`;
      const idx = text.indexOf(endStr);
      if (idx !== -1) {
        events.push({
          kind: "end",
          envName: topEnv.envName,
          ch: idx,
          endCh: idx + endStr.length,
          source: endStr,
        });
      }
      // Process this (at most one) matching-end event through the
      // shared handler, then advance to the next line. We deliberately
      // skipped the normal begin/end/item collection above.
      for (const ev of events) {
        processEvent(ev, line);
      }
      continue;
    }

    BEGIN_RE.lastIndex = 0;
    let bm: RegExpExecArray | null;
    while ((bm = BEGIN_RE.exec(text)) !== null) {
      events.push({
        kind: "begin",
        envName: bm[1],
        ch: bm.index,
        endCh: bm.index + bm[0].length,
        source: bm[0],
      });
    }

    END_RE.lastIndex = 0;
    let em: RegExpExecArray | null;
    while ((em = END_RE.exec(text)) !== null) {
      events.push({
        kind: "end",
        envName: em[1],
        ch: em.index,
        endCh: em.index + em[0].length,
        source: em[0],
      });
    }

    // Only collect \item events when the top of stack is a list env
    // and the item is between begin and end on the same line we're
    // currently scanning. We collect for all lines and filter later
    // by `from.line >= fromLine`.
    ITEM_RE.lastIndex = 0;
    let im: RegExpExecArray | null;
    while ((im = ITEM_RE.exec(text)) !== null) {
      events.push({
        kind: "item",
        ch: im.index,
        endCh: im.index + im[0].length,
        label: im[1] ?? null,
        source: im[0],
      });
    }

    events.sort((a, b) => a.ch - b.ch);

    for (const ev of events) {
      processEvent(ev, line);
    }
  }

  // Unterminated raw-text envs. A verbatim / lstlisting / minted whose
  // matching `\end{…}` lies beyond `maxSearchLine` never gets popped,
  // so the `end`-event branch that pushes its `protectedRange` never
  // runs. Its body is opaque code, so any visible lines below the
  // `\begin` must still be shielded from the per-line scanners —
  // otherwise raw code emits bogus inline widgets. Protect from
  // beginLine+1 through the end of what we scanned (half-open, so
  // `maxSearchLine + 1`).
  for (const open of stack) {
    if (isRawTextEnv(open.envName) && maxSearchLine > open.beginLine + 1) {
      protectedRanges.push({
        from: open.beginLine + 1,
        to: maxSearchLine + 1,
      });
    }
  }

  function processEvent(ev: Event, line: number): void {
    {
      if (ev.kind === "begin") {
        const isList = LIST_ENV_NAMES.has(ev.envName);
        // List depth = number of list envs already open on the
        // stack (excluding this one). Computed at push time so
        // depth is stable across the env's lifetime — it doesn't
        // change if a deeper list is opened and closed inside us.
        let listDepth: number | undefined = undefined;
        if (isList) {
          listDepth = 0;
          for (const e of stack) {
            if (LIST_ENV_NAMES.has(e.envName)) listDepth++;
          }
        }
        stack.push({
          envName: ev.envName,
          beginLine: line,
          beginCh: ev.ch,
          beginEndCh: ev.endCh,
          source: ev.source,
          listDepth,
          items: isList ? [] : null,
        });
      } else if (ev.kind === "end") {
        // Pop matching env (nearest open env with the same name).
        let idx = -1;
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].envName === ev.envName) {
            idx = s;
            break;
          }
        }
        if (idx === -1) return;
        const begin = stack[idx];
        stack.length = idx;

        const isList = LIST_ENV_NAMES.has(begin.envName);
        const isVerbatim = VERBATIM_ENV_NAMES.has(begin.envName);

        if (isList) {
          const depth = begin.listDepth ?? 0;
          // Emit begin descriptor if visible.
          if (begin.beginLine >= fromLine && begin.beginLine < toLine) {
            out.push({
              type: "list-env-begin",
              from: { line: begin.beginLine, ch: begin.beginCh },
              to: { line: begin.beginLine, ch: begin.beginEndCh },
              source: begin.source,
              payload: { envName: begin.envName, depth },
            });
          }
          // Emit each item descriptor if visible. Index is computed
          // from position in `begin.items`, NOT in payload-hash —
          // adding/removing items doesn't churn the rest of the chips.
          if (begin.items != null) {
            for (let i = 0; i < begin.items.length; i++) {
              const item = begin.items[i];
              if (item.line >= fromLine && item.line < toLine) {
                out.push({
                  type: "list-item",
                  from: { line: item.line, ch: item.ch },
                  to: { line: item.line, ch: item.endCh },
                  source: item.source,
                  payload: {
                    envName: begin.envName,
                    index: i + 1,
                    label: item.label,
                    depth,
                  },
                });
              }
            }
          }
          // Emit end descriptor if visible.
          if (line >= fromLine && line < toLine) {
            out.push({
              type: "list-env-end",
              from: { line, ch: ev.ch },
              to: { line, ch: ev.endCh },
              source: ev.source,
              payload: { envName: begin.envName, depth },
            });
          }
        } else if (isVerbatim) {
          // Emit a single multi-line verbatim-env descriptor when
          // its begin is within the viewport.
          if (begin.beginLine >= fromLine && begin.beginLine < toLine) {
            const from = { line: begin.beginLine, ch: begin.beginCh };
            const to = { line, ch: ev.endCh };
            out.push({
              type: "verbatim-env",
              from,
              to,
              source: getRangeFromSource(src, from, to),
              payload: { envName: begin.envName },
            });
          }
          // Protect the body either way — covers the begin-above-
          // viewport case where no covering descriptor is emitted
          // but the body lines [beginLine+1, endLine) are visible
          // and would otherwise be parsed by per-line scanners.
          // Half-open: protects beginLine+1 through endLine-1
          // inclusive, leaving the \begin and \end lines alone.
          if (line > begin.beginLine + 1) {
            protectedRanges.push({ from: begin.beginLine + 1, to: line });
          }
        } else if (
          ABSTRACT_ENV_NAMES.has(begin.envName) ||
          THEOREM_ENV_NAMES.has(begin.envName)
        ) {
          // Abstract + theorem family: emit narrow begin/end markers
          // (same shape as list envs) so inner math / textbf / list
          // widgets inside the body keep rendering through the normal
          // pipeline. A covering descriptor would subsume them via
          // dropOverlaps — we deliberately avoid that here.
          if (begin.beginLine >= fromLine && begin.beginLine < toLine) {
            out.push({
              type: "prose-env-begin",
              from: { line: begin.beginLine, ch: begin.beginCh },
              to: { line: begin.beginLine, ch: begin.beginEndCh },
              source: begin.source,
              payload: { envName: begin.envName },
            });
          }
          if (line >= fromLine && line < toLine) {
            out.push({
              type: "prose-env-end",
              from: { line, ch: ev.ch },
              to: { line, ch: ev.endCh },
              source: ev.source,
              payload: { envName: begin.envName },
            });
          }
        } else if (CODE_LISTING_ENV_NAMES.has(begin.envName)) {
          // Code listings (lstlisting, minted) hold raw code — keep
          // the covering descriptor so inner widgets get subsumed,
          // and protect the body in case begin is above the
          // viewport.
          if (begin.beginLine >= fromLine && begin.beginLine < toLine) {
            const from = { line: begin.beginLine, ch: begin.beginCh };
            const to = { line, ch: ev.endCh };
            out.push({
              type: "code-listing-env",
              from,
              to,
              source: getRangeFromSource(src, from, to),
              payload: { envName: begin.envName },
            });
          }
          if (line > begin.beginLine + 1) {
            protectedRanges.push({ from: begin.beginLine + 1, to: line });
          }
        } else if (TABULAR_ENV_NAMES.has(begin.envName)) {
          // Tabular: fail-open. Only treat it as a table if the colspec
          // parses, cell counts match, and there's no \multicolumn.
          // Otherwise we leave the source raw so the user can see /
          // edit the LaTeX directly — better than a half-broken table.
          const from = { line: begin.beginLine, ch: begin.beginCh };
          const to = { line, ch: ev.endCh };
          const source = getRangeFromSource(src, from, to);
          const data = parseTabular(source, begin.envName);
          if (data != null) {
            // Protect the body lines from the per-line scanners so
            // inner \textbf / math don't render inside the table —
            // done OUTSIDE the begin-visible check below so it still
            // applies when \begin{tabular} is above the viewport and we
            // scrolled into the middle of a supported table. (Mirrors
            // the code-listing branch above.)
            if (line > begin.beginLine + 1) {
              protectedRanges.push({
                from: begin.beginLine + 1,
                to: line,
              });
            }
            // The covering widget anchors at \begin, so only emit it
            // when that line is visible.
            if (begin.beginLine >= fromLine && begin.beginLine < toLine) {
              out.push({
                type: "tabular-env",
                from,
                to,
                source,
                payload: {
                  envName: begin.envName,
                  alignments: data.alignments,
                  rows: data.rows,
                },
              });
            }
          }
          // If `data == null` — no widget, no protection; raw source +
          // any inline widgets stay visible, same as an unsupported
          // tabular.
        }
      } else {
        // \item: associate with nearest open list env.
        let targetIdx = -1;
        for (let s = stack.length - 1; s >= 0; s--) {
          if (LIST_ENV_NAMES.has(stack[s].envName)) {
            targetIdx = s;
            break;
          }
        }
        if (targetIdx === -1) return;
        const env = stack[targetIdx];
        if (env.items == null) return;
        env.items.push({
          line,
          ch: ev.ch,
          endCh: ev.endCh,
          label: ev.label,
          source: ev.source,
        });
      }
    }
  }
}

/**
 * Pure parser entry point: scans `[fromLine, toLine)` of a
 * `LineSource` and returns the non-overlapping `WidgetDescriptor`s in
 * document order. `parseViewport` is a thin adapter over this for the
 * live-CodeMirror caller; tests build a `LineSource` from a
 * `string[]`.
 */
export function parseLines(
  src: LineSource,
  fromLine: number,
  toLine: number,
): WidgetDescriptor[] {
  const out: WidgetDescriptor[] = [];
  // Verbatim / code-listing body line ranges (half-open). Populated
  // by scanEnvBlocks; consulted at the end to drop descriptors that
  // landed inside raw-text blocks whose `\begin` is above the
  // expanded viewport (no covering descriptor to subsume them).
  const protectedRanges: Array<{ from: number; to: number }> = [];
  // Multi-line constructs first — their multi-line spans need to be
  // in `out` before single-line scanners run so `dropOverlaps`
  // correctly subsumes any inner widgets. List envs emit only narrow
  // descriptors (begin/end/item), so they intentionally don't
  // subsume the item content.
  scanMathEnvs(src, fromLine, toLine, out);
  scanBracketDisplayMath(src, fromLine, toLine, out);
  scanDoubleDollarMath(src, fromLine, toLine, out);
  scanEnvBlocks(src, fromLine, toLine, out, protectedRanges);
  for (let line = fromLine; line < toLine; line++) {
    const raw = src.getLine(line);
    if (raw.length === 0) continue;
    // Strip the line's `%` comment tail so e.g. `% \section{old}`
    // does not produce a widget. Multi-line scanners above use
    // `getLineStripped` for the same reason.
    const text = stripComment(raw);
    if (text.length === 0) continue;
    for (const [cmd, type] of SINGLE_ARG_COMMANDS) {
      scanSingleArgCommand(text, line, cmd, type, out);
    }
    for (const [cmd, type] of TWO_ARG_COMMANDS) {
      scanTwoArgCommand(text, line, cmd, type, out);
    }
    for (const [cmd, type] of ZERO_ARG_COMMANDS) {
      scanZeroArgCommand(text, line, cmd, type, out);
    }
    scanIncludegraphics(text, line, out);
    scanVerb(text, line, out);
    scanInlineDollarMath(text, line, out);
    scanParenMath(text, line, out);
    scanFontSizeGroup(text, line, out);
    // Custom-macro fallback runs LAST among per-line scanners so
    // that known commands always win the first match.
    scanCustomMacro(text, line, out);
  }
  out.sort((a, b) => {
    if (a.from.line !== b.from.line) return a.from.line - b.from.line;
    if (a.from.ch !== b.from.ch) return a.from.ch - b.from.ch;
    // Tie-break at equal `from`: WIDER descriptor (greater `to`) first
    // so a container sorts before a tiny earlier sibling and
    // dropOverlaps keeps the container (widest-wins).
    if (a.to.line !== b.to.line) return b.to.line - a.to.line;
    return b.to.ch - a.to.ch;
  });
  return dropOverlaps(filterProtected(out, protectedRanges));
}

/**
 * Thin adapter: run the pure parser against a live CodeMirror editor.
 * Signature and behavior are identical to the previous `parseViewport`
 * for the existing widget-manager caller.
 */
export function parseViewport(
  cm: CodeMirror.Editor,
  fromLine: number,
  toLine: number,
): WidgetDescriptor[] {
  return parseLines(
    {
      getLine: (n) => cm.getLine(n) ?? "",
      lineCount: () => cm.lineCount(),
    },
    fromLine,
    toLine,
  );
}

/**
 * Drop descriptors whose `from.line` falls inside any protected
 * range. Ranges are half-open: `[from, to)`. Used to suppress per-
 * line widget descriptors inside verbatim / lstlisting / minted
 * bodies whose `\begin{…}` sits above the expanded viewport (so no
 * covering descriptor was emitted to subsume them via dropOverlaps).
 */
function filterProtected(
  descriptors: WidgetDescriptor[],
  ranges: Array<{ from: number; to: number }>,
): WidgetDescriptor[] {
  if (ranges.length === 0) return descriptors;
  return descriptors.filter((d) => {
    for (const r of ranges) {
      if (d.from.line >= r.from && d.from.line < r.to) return false;
    }
    return true;
  });
}

function dropOverlaps(descriptors: WidgetDescriptor[]): WidgetDescriptor[] {
  const result: WidgetDescriptor[] = [];
  // Track the MAX end-of-coverage seen so far (not just the last kept
  // descriptor's `to`). A later descriptor that starts before this max
  // is overlapping a previously kept container and is dropped, even if
  // the immediately-preceding kept descriptor ended earlier.
  let maxEnd: { line: number; ch: number } | null = null;
  for (const d of descriptors) {
    if (maxEnd != null) {
      const startsInside =
        d.from.line < maxEnd.line ||
        (d.from.line === maxEnd.line && d.from.ch < maxEnd.ch);
      if (startsInside) continue;
    }
    result.push(d);
    if (
      maxEnd == null ||
      d.to.line > maxEnd.line ||
      (d.to.line === maxEnd.line && d.to.ch > maxEnd.ch)
    ) {
      maxEnd = d.to;
    }
  }
  return result;
}
