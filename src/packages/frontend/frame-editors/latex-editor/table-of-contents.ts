/*
A quick naive table of contents implementation, at least for the master document.

This isn't sophisticated at all.  We also don't include the numbers even though we compute
them, since it's too easy to mess them up by including subfiles or using macros to
change them.
*/

import { TableOfContentsEntry as Entry } from "@cocalc/frontend/components";

export function parseTableOfContents(latex: string): Entry[] {
  let id = 0;
  const entries: Entry[] = [];
  let number: number[] = [0];
  for (const line0 of latex.split("\n")) {
    id += 1;
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
