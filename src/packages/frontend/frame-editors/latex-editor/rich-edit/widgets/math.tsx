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

All three render via `mathToHtml` (KaTeX) and ship with an
always-visible trailing pencil button. Clicking the pencil opens the
existing `ai_gen_formula` dialog pre-populated with the current
source; on accept the source is replaced. The wire-up lives in the
widget-manager (it has access to cm + the live marker).

A KaTeX render error doesn't break the widget — we fall back to a
muted red "?math?" so the user sees something is off and can hover
to inspect the source.
*/

import { Tooltip } from "antd";
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import mathToHtml from "@cocalc/frontend/misc/math-to-html";
import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";

function renderMath(source: string, isInline: boolean) {
  if (source.trim() === "") {
    return null;
  }
  const { __html, err } = mathToHtml(source, isInline);
  if (err) {
    return (
      <Tooltip title={err}>
        <span
          style={{
            color: COLORS.ANTD_RED,
            fontStyle: "italic",
            fontSize: "0.9em",
          }}
        >
          ?math?
        </span>
      </Tooltip>
    );
  }
  return <span dangerouslySetInnerHTML={{ __html }} />;
}

function PencilButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip title="Edit with AI" placement="top" mouseEnterDelay={0.3}>
      <span
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick();
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
        }}
      >
        <Icon name="pencil" />
      </span>
    </Tooltip>
  );
}

export function MathInline(props: WidgetProps) {
  const content =
    (props.descriptor.payload?.content as string | undefined) ?? "";
  return (
    <Widget {...props}>
      {content === "" ? (
        <EmptyPlaceholder label="empty math" />
      ) : (
        renderMath(content, true)
      )}
      {props.onAiEdit != null && (
        <PencilButton onClick={() => void props.onAiEdit!()} />
      )}
    </Widget>
  );
}

export function MathDisplay(props: WidgetProps) {
  const content =
    (props.descriptor.payload?.content as string | undefined) ?? "";
  return (
    <Widget {...props} display="inline-block">
      {content === "" ? (
        <EmptyPlaceholder label="empty display math" />
      ) : (
        renderMath(content, false)
      )}
      {props.onAiEdit != null && (
        <PencilButton onClick={() => void props.onAiEdit!()} />
      )}
    </Widget>
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
  // For envs, hand the full source (including \begin / \end) to
  // KaTeX — it knows align/gather/equation/multline natively.
  return (
    <Widget {...props} display="inline-block">
      {renderMath(stripEnvNumbering(props.descriptor.source), false)}
      {props.onAiEdit != null && (
        <PencilButton onClick={() => void props.onAiEdit!()} />
      )}
    </Widget>
  );
}
