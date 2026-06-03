/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Math widgets — Phase 4.

Three flavors:
 - MathInline       $…$ and \(…\)
 - MathDisplay      \[…\] and $$…$$ (single-line variants)
 - MathEnv          \begin{equation|align|gather|multline}…\end{…}
                    (multi-line, starred variants supported)

All three render via `mathToHtml` (KaTeX) and ship with a trailing
pencil button. Clicking the pencil opens the `ai_gen_formula` dialog in
edit mode: the current formula is shown as context (plus a few lines of
surrounding document text), the user types what to change, and on accept
the source is replaced. The wire-up lives in the widget-manager (it has
access to cm + the live marker).

A KaTeX render error doesn't break the widget — we fall back to a
muted red "?math?" so the user sees something is off and can hover
to inspect the source.
*/

import { Tooltip } from "antd";
import { CSSProperties, ReactNode, useContext, useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import mathToHtml from "@cocalc/frontend/misc/math-to-html";
import { COLORS } from "@cocalc/util/theme";

import { MathMacrosContext } from "../math-macros-context";
import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";

function renderMath(
  source: string,
  isInline: boolean,
  macros?: Record<string, string>,
  rawSource?: string,
) {
  if (source.trim() === "") {
    return null;
  }
  const { __html, err } = mathToHtml(source, isInline, macros);
  if (err) {
    // KaTeX couldn't render it (e.g. a macro it doesn't know, or the
    // formula is mid-edit and temporarily broken). Don't show a jarring
    // "?math?" marker — just display the raw LaTeX, so the widget looks
    // like the plain source. The KaTeX error is on hover for debugging.
    return (
      <span title={err} style={{ whiteSpace: "pre-wrap" }}>
        {rawSource ?? source}
      </span>
    );
  }
  return <span dangerouslySetInnerHTML={{ __html }} />;
}

function PencilButton({
  onClick,
  style,
}: {
  onClick: () => void;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip title="Edit with AI" placement="top" mouseEnterDelay={0.3}>
      <span
        role="button"
        aria-label="Edit math with AI"
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            e.preventDefault();
            onClick();
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          marginLeft: 4,
          padding: "0 2px",
          opacity: hover ? 1 : 0.35,
          cursor: "pointer",
          color: COLORS.GRAY_D,
          fontSize: "0.85em",
          verticalAlign: "middle",
          ...style,
        }}
      >
        <Icon name="pencil" />
      </span>
    </Tooltip>
  );
}

// Display math ($$…$$, \[…\], and the equation/align/… envs) is laid
// out as a centered block. The host span is made `display:block` by the
// widget-manager for these types so the centering spans the line. The
// formula sits in its own horizontally-scrollable box (wide equations
// scroll instead of blowing out the line), and the AI-edit pencil is
// pinned to the top-right corner so it sits NEXT TO the formula rather
// than wrapping onto its own line below it.
const DISPLAY_WIDGET_STYLE = {
  position: "relative",
  textAlign: "center",
  width: "100%",
} as const;

const DISPLAY_SCROLL_STYLE = {
  display: "block",
  maxWidth: "100%",
  overflowX: "auto",
} as const;

const DISPLAY_PENCIL_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  marginLeft: 0,
};

function DisplayMath({
  props,
  children,
}: {
  props: WidgetProps;
  children: ReactNode;
}) {
  return (
    <Widget {...props} display="block" style={DISPLAY_WIDGET_STYLE}>
      <span style={DISPLAY_SCROLL_STYLE}>{children}</span>
      {props.onAiEdit != null && (
        <PencilButton
          style={DISPLAY_PENCIL_STYLE}
          onClick={() => void props.onAiEdit!()}
        />
      )}
    </Widget>
  );
}

export function MathInline(props: WidgetProps) {
  const macros = useContext(MathMacrosContext);
  const content =
    (props.descriptor.payload?.content as string | undefined) ?? "";
  return (
    <Widget {...props}>
      {content === "" ? (
        <EmptyPlaceholder label="empty math" />
      ) : (
        renderMath(content, true, macros, props.descriptor.source)
      )}
      {props.onAiEdit != null && (
        <PencilButton onClick={() => void props.onAiEdit!()} />
      )}
    </Widget>
  );
}

export function MathDisplay(props: WidgetProps) {
  const macros = useContext(MathMacrosContext);
  const content =
    (props.descriptor.payload?.content as string | undefined) ?? "";
  return (
    <DisplayMath props={props}>
      {content === "" ? (
        <EmptyPlaceholder label="empty display math" />
      ) : (
        renderMath(content, false, macros, props.descriptor.source)
      )}
    </DisplayMath>
  );
}

/**
 * Convert non-starred math envs to their starred variants so KaTeX
 * doesn't render fake auto-numbered tags like `(2)` `(3)` in the
 * in-buffer preview. The actual equation numbers come from the real
 * LaTeX compilation in the PDF pane; showing placeholder numbers
 * here is misleading and the float positioning collides with the
 * inline widget's reflow (the visible `( )` looks "out of place").
 *
 * Only `\begin{env}` / `\end{env}` markers are rewritten — the CM
 * source itself is untouched, and user-explicit `\tag{…}` inside
 * the body keeps working.
 */
function stripEnvNumbering(source: string): string {
  return source.replace(
    /\\(begin|end)\{(equation|align|gather|multline)\}/g,
    "\\$1{$2*}",
  );
}

export function MathEnv(props: WidgetProps) {
  const macros = useContext(MathMacrosContext);
  // For envs, hand the full source (including \begin / \end) to
  // KaTeX — it knows align/gather/equation/multline natively.
  return (
    <DisplayMath props={props}>
      {renderMath(
        stripEnvNumbering(props.descriptor.source),
        false,
        macros,
        props.descriptor.source,
      )}
    </DisplayMath>
  );
}
