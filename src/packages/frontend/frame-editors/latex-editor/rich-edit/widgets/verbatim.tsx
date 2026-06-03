/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Inline verbatim: `\verb<DELIM>...<DELIM>`.

Multi-line `\begin{verbatim}…\end{verbatim}` is Phase 5 (needs the
env-stack scanner that lists will also use).
*/

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";

/**
 * Extract the body (lines between \begin{verbatim} and
 * \end{verbatim}) from a multi-line source string. The source
 * starts with `\begin{name}` on its first line; we strip that line
 * plus the leading newline, and similarly the trailing
 * `\end{name}` line plus the newline before it.
 */
function verbatimBody(source: string): string {
  const firstNl = source.indexOf("\n");
  if (firstNl === -1) return "";
  const lastNl = source.lastIndexOf("\n");
  if (lastNl <= firstNl) return "";
  return source.slice(firstNl + 1, lastNl);
}

export function VerbatimEnv(props: WidgetProps) {
  const body = verbatimBody(props.descriptor.source);
  return (
    <Widget {...props} display="inline-block">
      <pre
        style={{
          fontFamily: "monospace",
          fontSize: "0.95em",
          background: COLORS.GRAY_LL,
          padding: "4px 8px",
          borderRadius: 3,
          margin: 0,
          // Preserve the original whitespace exactly (the whole point
          // of verbatim).
          whiteSpace: "pre",
          // The widget DOM is inside a single CM line slot — let it
          // overflow horizontally for long lines, not wrap.
          overflowX: "auto",
        }}
      >
        {body}
      </pre>
    </Widget>
  );
}

export function Verb(props: WidgetProps) {
  const content =
    (props.descriptor.payload?.content as string | undefined) ?? "";
  return (
    <Widget {...props}>
      {content === "" ? (
        <EmptyPlaceholder label="empty verbatim" />
      ) : (
        <code
          style={{
            fontFamily: "monospace",
            fontSize: "0.95em",
            background: COLORS.GRAY_LL,
            padding: "0 3px",
            borderRadius: 2,
          }}
        >
          {content}
        </code>
      )}
    </Widget>
  );
}
