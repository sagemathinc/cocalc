/*
A quick naive table of contents implementation, at least for the master document.

This isn't sophisticated at all.  We also don't include the numbers even though we compute
them, since it's too easy to mess them up by including subfiles or using macros to
change them.
*/

import { TableOfContentsEntry as Entry } from "@cocalc/frontend/components";

import { scanBookmarks } from "./chat-markers";

export function parseTableOfContents(
  latex: string,
  opts: { includeBookmarks?: boolean } = {},
): Entry[] {
  let id = 0;
  const entries: Entry[] = [];
  let number: number[] = [0];

  // Optional bookmark overlay. We key by the bookmark's 0-based line so we
  // can interleave bookmark entries with headers in document order. Only
  // the FIRST bookmark for each text is surfaced (the user asked for a
  // no-dropdown behavior — duplicates are assumed to be reference copies).
  const bookmarksByLine = new Map<number, string>();
  if (opts.includeBookmarks) {
    const seenTexts = new Set<string>();
    for (const b of scanBookmarks(latex)) {
      if (seenTexts.has(b.text)) continue;
      seenTexts.add(b.text);
      if (!bookmarksByLine.has(b.line)) {
        bookmarksByLine.set(b.line, b.text);
      }
    }
  }

  const linesArr = latex.split("\n");
  for (let lineIdx = 0; lineIdx < linesArr.length; lineIdx++) {
    const line0 = linesArr[lineIdx];
    id += 1;

    // Bookmark entry for this line (if any). Emit BEFORE the header check
    // so a line that happened to contain both (very unusual) gets two
    // entries in stable order. Rendered one level deeper than the most
    // nested section level so it's visually "under" the surrounding prose.
    const bookmarkText = bookmarksByLine.get(lineIdx);
    if (bookmarkText != null) {
      // Suffix the id so a line that carries both a bookmark and a
      // heading gets two distinct React keys. `scrollToHeading` goes
      // through `parseInt`, which still yields the correct line.
      entries.push({
        level: 6,
        value: bookmarkText,
        id: `${id}b`,
        icon: "bookmark",
        iconColor: "var(--cocalc-link, #1677ff)",
      });
    }

    const line = line0.trim();
    const section = extractHeading(line, "\\section{");
    if (section != null) {
      number = [number[0] + 1];
      entries.push({ level: 1, value: section, id: `${id}` });
      continue;
    }
    const subsection = extractHeading(line, "\\subsection{");
    if (subsection != null) {
      number = [number[0], (number[1] ?? 0) + 1];
      entries.push({ level: 2, value: subsection, id: `${id}` });
      continue;
    }
    const subsubsection = extractHeading(line, "\\subsubsection{");
    if (subsubsection != null) {
      number = [number[0], number[1], (number[2] ?? 0) + 1];
      entries.push({ level: 3, value: subsubsection, id: `${id}` });
      continue;
    }
    const paragraph = extractHeading(line, "\\paragraph{");
    if (paragraph != null) {
      number = [number[0], number[1], number[2], (number[3] ?? 0) + 1];
      entries.push({ level: 4, value: paragraph, id: `${id}` });
      continue;
    }
    const subparagraph = extractHeading(line, "\\subparagraph{");
    if (subparagraph != null) {
      number = [
        number[0],
        number[1],
        number[2],
        number[3],
        (number[4] ?? 0) + 1,
      ];
      entries.push({ level: 5, value: subparagraph, id: `${id}` });
      continue;
    }
  }

  return entries;
}

/**
 * If `line` starts with `prefix` (ending in `{`), return the text between
 * that `{` and its matching `}`. Nested braces are tracked so
 * `\section{foo \textbf{bar}}` yields `foo \textbf{bar}`, and trailing
 * content after the closing `}` (e.g. `% chat: ...`) is ignored. Returns
 * `null` if the prefix doesn't match or the group isn't closed.
 */
function extractHeading(line: string, prefix: string): string | null {
  if (!line.startsWith(prefix)) return null;
  let depth = 1;
  for (let i = prefix.length; i < line.length; i++) {
    const ch = line[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return line.slice(prefix.length, i);
    }
  }
  return null;
}
