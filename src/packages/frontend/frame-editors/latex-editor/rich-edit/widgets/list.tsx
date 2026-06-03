/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
List widgets — Phase 5.

The parser emits three descriptor types per balanced list env:
 - `list-env-begin`  for `\begin{itemize|enumerate|description}`
 - `list-env-end`    for the matching `\end{…}`
 - `list-item`       for each `\item` (or `\item[Label]`) in the body

Prose between items remains as live source, so `\textbf` etc. inside
list items render via the normal widget pipeline.

Counter (for `enumerate`): the parser computes the 1-based index from
each item's position within the env body and stores it in payload. The
counter is NOT part of the marker key — inserting/deleting items
doesn't churn other chips' markers (per the design doc fail-open
note).

Nested numbering follows the LaTeX defaults (for the article class):
  enumerate: depth 0 = `1.` `2.` `3.`
             depth 1 = `a.` `b.` `c.`
             depth 2 = `i.` `ii.` `iii.`
             depth 3+ = `A.` `B.` `C.`
  itemize:   depth 0 = `•`,  1 = `–`,  2 = `*`,  3+ = `·`
The parser pushes the env's `listDepth` (count of list envs ABOVE this
one on the env stack, computed at \begin time) into each item's
payload, so depth is stable across edits — adding a deeper sublist
doesn't churn outer items' marker keys.
*/

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";
import { Widget } from "./common";

const ENV_LABEL_STYLE = {
  fontFamily: "sans-serif",
  fontSize: "0.75em",
  color: COLORS.GRAY,
  fontStyle: "italic",
  letterSpacing: "0.02em",
} as const;

const MARKER_STYLE = {
  fontFamily: "sans-serif",
  fontWeight: 600,
  color: COLORS.GRAY_D,
  marginRight: 4,
} as const;

function envNameOf(props: WidgetProps): string {
  return (props.descriptor.payload?.envName as string | undefined) ?? "";
}

// ---------- Marker computations (depth-aware) ----------

const ITEMIZE_MARKERS = ["•", "–", "*", "·"] as const;

function toLowerLetter(n: number): string {
  // 1 -> "a", 2 -> "b", …, 26 -> "z". Beyond 26 just keep using "z"
  // (legitimately long lists are exceedingly rare; falling back is
  // better than crashing the widget).
  if (n < 1) return "?";
  if (n <= 26) return String.fromCharCode(96 + n);
  return "z";
}

function toUpperLetter(n: number): string {
  if (n < 1) return "?";
  if (n <= 26) return String.fromCharCode(64 + n);
  return "Z";
}

function toRoman(n: number): string {
  // Lowercase roman, standard algorithm. Bounds: returns the literal
  // number for nonsensical inputs.
  if (n < 1 || n >= 4000) return String(n);
  const table: ReadonlyArray<readonly [number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let result = "";
  for (const [v, s] of table) {
    while (n >= v) {
      result += s;
      n -= v;
    }
  }
  return result;
}

function enumerateMarker(index: number, depth: number): string {
  if (depth <= 0) return `${index}.`;
  if (depth === 1) return `${toLowerLetter(index)}.`;
  if (depth === 2) return `${toRoman(index)}.`;
  return `${toUpperLetter(index)}.`;
}

function itemizeMarker(depth: number): string {
  const i = Math.max(0, Math.min(depth, ITEMIZE_MARKERS.length - 1));
  return ITEMIZE_MARKERS[i];
}

export function ListEnvBegin(props: WidgetProps) {
  // Subtle chip showing the env is starting. Honest about what's
  // there without obscuring source structure. Clicking dissolves
  // the marker so the user can edit the `\begin{…}` line directly.
  const envName = envNameOf(props);
  return (
    <Widget {...props}>
      <span style={ENV_LABEL_STYLE}>▸ {envName}</span>
    </Widget>
  );
}

export function ListEnvEnd(props: WidgetProps) {
  return (
    <Widget {...props}>
      <span style={ENV_LABEL_STYLE}>◂ end {envNameOf(props)}</span>
    </Widget>
  );
}

export function ListItem(props: WidgetProps) {
  const envName = envNameOf(props);
  const index = (props.descriptor.payload?.index as number | undefined) ?? 1;
  const label = props.descriptor.payload?.label as string | null | undefined;
  const depth = (props.descriptor.payload?.depth as number | undefined) ?? 0;
  const hasLabel = label != null && label !== "";
  let marker: string;
  if (hasLabel) {
    // An optional label — `\item[(a)]`, `\item[$\star$]`, or the
    // standard `description` form — REPLACES the default bullet/number
    // in LaTeX (for itemize, enumerate and description alike). Suppress
    // the default marker; the label span below renders in its place.
    marker = "";
  } else if (envName === "enumerate") {
    marker = enumerateMarker(index, depth);
  } else {
    // itemize + description with no label: a depth-appropriate bullet.
    marker = itemizeMarker(depth);
  }
  return (
    <Widget {...props}>
      {marker !== "" && <span style={MARKER_STYLE}>{marker}</span>}
      {label != null && label !== "" && (
        <span
          style={{
            fontWeight: 700,
            marginRight: 4,
            color: COLORS.GRAY_D,
          }}
        >
          {label}
        </span>
      )}
    </Widget>
  );
}
