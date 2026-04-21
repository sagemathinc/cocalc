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
      entries.push({
        level: 6,
        value: bookmarkText,
        id: `${id}`,
        icon: "bookmark",
        iconColor: "#1677ff",
      });
    }

    const line = line0.trim();
    if (line.startsWith("\\section{")) {
      number = [number[0] + 1];
      entries.push({
        level: 1,
        value: line.slice("\\section{".length, -1),
        id: `${id}`,
        /*number, */
      });
      continue;
    }
    if (line.startsWith("\\subsection{")) {
      number = [number[0], (number[1] ?? 0) + 1];
      entries.push({
        level: 2,
        value: line.slice("\\subsection{".length, -1),
        id: `${id}`,
        /* number, */
      });
      continue;
    }
    if (line.startsWith("\\subsubsection{")) {
      number = [number[0], number[1], (number[2] ?? 0) + 1];
      entries.push({
        level: 3,
        value: line.slice("\\subsubsection{".length, -1),
        id: `${id}`,
       /* number, */
      });
      continue;
    }
    if (line.startsWith("\\paragraph{")) {
      number = [number[0], number[1], number[2], (number[3] ?? 0) + 1];
      entries.push({
        level: 4,
        value: line.slice("\\paragraph{".length, -1),
        id: `${id}`,
        /* number, */
      });
      continue;
    }
    if (line.startsWith("\\subparagraph{")) {
      number = [
        number[0],
        number[1],
        number[2],
        number[3],
        (number[4] ?? 0) + 1,
      ];
      entries.push({
        level: 5,
        value: line.slice("\\subparagraph{".length, -1),
        id: `${id}`,
        /*number,*/
      });
      continue;
    }
  }

  return entries;
}
