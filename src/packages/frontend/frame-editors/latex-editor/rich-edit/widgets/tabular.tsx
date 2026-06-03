/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
TabularEnv — fail-open table renderer.

The parser only emits a `tabular-env` descriptor when it could fully
make sense of the colspec, row separators, and cell counts. Anything
funky (mismatched columns, `\multicolumn`, exotic colspec like `*{n}{…}`
or `X`, etc.) → no descriptor, source stays raw. So by the time we get
here we already have clean `alignments` + `rows` in the payload.

Cell content is rendered through `renderInline`, the same recursive
inline renderer used by text-style widgets, so inline math (`$…$`),
`\textbf`, etc. inside a cell display as formatted content rather than
raw LaTeX. Anything `renderInline` doesn't recognize falls back to its
raw source text. The hover tooltip on the widget still shows the full
original source for inspection.
*/

import { COLORS } from "@cocalc/util/theme";

import { TabularAlign, TabularRow } from "../parser";
import { WidgetProps } from "../types";
import { Widget } from "./common";
import { renderInline } from "./render-inline";

const TABLE_STYLE = {
  borderCollapse: "collapse",
  fontSize: "0.95em",
  fontFamily: "inherit",
  background: "transparent",
  maxWidth: "100%",
} as const;

const CELL_STYLE_BASE = {
  padding: "4px 10px",
  verticalAlign: "top",
  color: COLORS.GRAY_DD,
} as const;

const BORDER_ROW_STYLE = {
  borderBottom: `1px solid ${COLORS.GRAY_M}`,
} as const;

const EMPTY_BORDER_CELL_STYLE = { padding: 0, lineHeight: "4px" } as const;

const EMPTY_TABULAR_STYLE = {
  color: COLORS.GRAY_M,
  fontStyle: "italic",
} as const;

function alignmentToCss(a: TabularAlign): "left" | "center" | "right" {
  switch (a) {
    case "l":
      return "left";
    case "c":
      return "center";
    case "r":
      return "right";
    case "p":
      // `p{width}` columns are left-aligned and wrap. We can't honor
      // the width here (the original colspec only stored the alignment
      // family); leave it left-aligned and let the cell wrap.
      return "left";
  }
}

export function TabularEnv(props: WidgetProps) {
  const alignments =
    (props.descriptor.payload?.alignments as TabularAlign[] | undefined) ?? [];
  const rows =
    (props.descriptor.payload?.rows as TabularRow[] | undefined) ?? [];

  if (alignments.length === 0 || rows.length === 0) {
    // Shouldn't happen — parser returns null in these cases — but
    // fail-open at the render level too.
    return (
      <Widget {...props} display="inline-block">
        <span style={EMPTY_TABULAR_STYLE}>(empty tabular)</span>
      </Widget>
    );
  }

  // Track which data-row should display a top border from a preceding
  // `\hline` / `\toprule` etc. row. We render borders by adding a
  // bottom-border to the row ABOVE. Leading borders (before the first
  // row) get rendered as an empty row with a bottom border.
  type RenderRow =
    | { kind: "data"; cells: string[]; bottomBorder: boolean }
    | { kind: "leading-border" };

  const renderRows: RenderRow[] = [];
  let pendingBorder = false;
  for (const r of rows) {
    if (r.kind === "border") {
      if (renderRows.length === 0) {
        renderRows.push({ kind: "leading-border" });
      } else {
        const last = renderRows[renderRows.length - 1];
        if (last.kind === "data") last.bottomBorder = true;
      }
      pendingBorder = true; // remembered but consumed lazily
    } else {
      renderRows.push({ kind: "data", cells: r.cells, bottomBorder: false });
      pendingBorder = false;
    }
  }
  // If the source had a TRAILING border (`\hline` after the last `\\`)
  // we want it as a bottom border on the last data row. The loop
  // above already handled it: the trailing `border` row found the
  // last data row and set bottomBorder=true.
  void pendingBorder;

  return (
    <Widget {...props} display="inline-block">
      <table style={TABLE_STYLE}>
        <tbody>
          {renderRows.map((r, idx) => {
            if (r.kind === "leading-border") {
              return (
                <tr key={`b${idx}`} style={BORDER_ROW_STYLE}>
                  {alignments.map((_, c) => (
                    <td key={c} style={EMPTY_BORDER_CELL_STYLE} />
                  ))}
                </tr>
              );
            }
            return (
              <tr
                key={idx}
                style={r.bottomBorder ? BORDER_ROW_STYLE : undefined}
              >
                {r.cells.map((cell, c) => {
                  const align = alignments[c] ?? "l";
                  return (
                    <td
                      key={c}
                      style={{
                        ...CELL_STYLE_BASE,
                        textAlign: alignmentToCss(align),
                      }}
                    >
                      {cell === "" ? " " : renderInline(cell)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Widget>
  );
}
