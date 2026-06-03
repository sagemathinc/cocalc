/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Tier 2 widgets — Phase 6.

Single-arg inline:
  \footnote{…}      small superscript marker with hover-source
  \ref{key}         neutral chip
  \cite{key}        neutral chip
  \label{key}       neutral chip
  \caption{…}       italic caption block
  \sout{…}          strikethrough (ulem)
  \hl{…}            yellow-highlight (soul)

Block envs:
  abstract          "Abstract" labeled soft-bordered block
  theorem-family    neutral chip with env name (theorem, lemma, proof,
                    definition, corollary, …); body stays as source
                    — full structured render is a later effort
  lstlisting/minted preformatted code block (similar to verbatim env)

What's intentionally not here:
 - Real `\ref` / `\cite` resolution against the document's .aux / .bib
   (doc-level state — see design doc gaps).
 - minted language-arg parsing (the `{lang}` after \begin{minted}); we
   render the body as a plain preformatted block.
 - Custom-macro fallback (the unknown-macro chip) — that's a separate
   amend after this one.
*/

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";
import { renderInline } from "./render-inline";

function contentOf(props: WidgetProps): string {
  return (props.descriptor.payload?.content as string | undefined) ?? "";
}

function envNameOf(props: WidgetProps): string {
  return (props.descriptor.payload?.envName as string | undefined) ?? "";
}

// ---------- Single-arg inline ----------

const REF_CHIP_STYLE = {
  display: "inline-block",
  padding: "0 6px",
  borderRadius: 10,
  background: COLORS.GRAY_LL,
  color: COLORS.GRAY_D,
  fontSize: "0.85em",
  fontFamily: "sans-serif",
  fontWeight: 500,
  border: `1px solid ${COLORS.GRAY_L}`,
  verticalAlign: "baseline",
} as const;

export function Footnote(props: WidgetProps) {
  const content = contentOf(props);
  return (
    <Widget {...props}>
      <sup
        style={{
          color: COLORS.BS_BLUE_TEXT,
          fontWeight: 600,
          fontSize: "0.75em",
          marginLeft: 1,
          userSelect: "none",
        }}
        title={content || "empty footnote"}
      >
        [fn]
      </sup>
    </Widget>
  );
}

function ReferenceChip({ prefix, ...props }: WidgetProps & { prefix: string }) {
  const key = contentOf(props);
  return (
    <Widget {...props}>
      <span style={REF_CHIP_STYLE}>
        {prefix}
        {key === "" ? "?" : key}
      </span>
    </Widget>
  );
}

export function Ref(props: WidgetProps) {
  return <ReferenceChip {...props} prefix="§ " />;
}

export function Cite(props: WidgetProps) {
  return <ReferenceChip {...props} prefix="cite: " />;
}

export function Label(props: WidgetProps) {
  return <ReferenceChip {...props} prefix="label: " />;
}

export function Caption(props: WidgetProps) {
  const content = contentOf(props);
  return (
    <Widget {...props}>
      {content === "" ? (
        <EmptyPlaceholder label="empty caption" />
      ) : (
        <em
          style={{
            fontStyle: "italic",
            color: COLORS.GRAY_D,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              marginRight: 4,
              fontStyle: "normal",
              fontSize: "0.85em",
              color: COLORS.GRAY,
            }}
          >
            Caption:
          </span>
          {renderInline(content)}
        </em>
      )}
    </Widget>
  );
}

export function Sout(props: WidgetProps) {
  const content = contentOf(props);
  return (
    <Widget {...props}>
      {content === "" ? (
        <EmptyPlaceholder label="empty strikethrough" />
      ) : (
        <s style={{ textDecorationStyle: "solid" }}>{renderInline(content)}</s>
      )}
    </Widget>
  );
}

export function Hl(props: WidgetProps) {
  const content = contentOf(props);
  return (
    <Widget {...props}>
      {content === "" ? (
        <EmptyPlaceholder label="empty highlight" />
      ) : (
        <mark
          style={{
            // COLORS.YELL_LL is the palette's soft yellow — visually
            // close to soul's default highlight and the right place
            // to centralize this so palette/theme changes flow
            // through.
            background: COLORS.YELL_LL,
            color: COLORS.GRAY_DD,
            padding: "0 2px",
            borderRadius: 1,
          }}
        >
          {renderInline(content)}
        </mark>
      )}
    </Widget>
  );
}

// ---------- Multi-line block envs ----------

/**
 * Extract the body (lines between \begin and \end) from a multi-line
 * env source string. Shared with the verbatim env logic.
 */
function envBody(source: string): string {
  const firstNl = source.indexOf("\n");
  if (firstNl === -1) return "";
  const lastNl = source.lastIndexOf("\n");
  if (lastNl <= firstNl) return "";
  return source.slice(firstNl + 1, lastNl);
}

// Begin/end chip styling for prose envs (abstract + theorem family).
// Narrow markers, like list-env-begin / list-env-end — they do NOT
// cover the body, so inner widgets (math, textbf, etc.) keep
// rendering through the normal pipeline.

const PROSE_LABEL_STYLE = {
  fontFamily: "sans-serif",
  fontSize: "0.78em",
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "capitalize",
} as const;

const PROSE_BEGIN_STYLE_THEOREM = {
  ...PROSE_LABEL_STYLE,
  color: COLORS.BS_BLUE_TEXT,
} as const;

const PROSE_BEGIN_STYLE_ABSTRACT = {
  ...PROSE_LABEL_STYLE,
  color: COLORS.GRAY_D,
  fontStyle: "italic",
} as const;

const PROSE_END_STYLE = {
  ...PROSE_LABEL_STYLE,
  color: COLORS.GRAY,
  fontWeight: 500,
} as const;

export function ProseEnvBegin(props: WidgetProps) {
  const envName = envNameOf(props);
  // Abstract gets a slightly different visual cue (italic gray) so
  // it doesn't look like a theorem. The label is always the env
  // name; future-work could special-case `\proof` → "Proof.".
  const style =
    envName === "abstract"
      ? PROSE_BEGIN_STYLE_ABSTRACT
      : PROSE_BEGIN_STYLE_THEOREM;
  return (
    <Widget {...props}>
      <span style={style}>▸ {envName}</span>
    </Widget>
  );
}

export function ProseEnvEnd(props: WidgetProps) {
  return (
    <Widget {...props}>
      <span style={PROSE_END_STYLE}>◂ end {envNameOf(props)}</span>
    </Widget>
  );
}

export function CodeListingEnv(props: WidgetProps) {
  // lstlisting / minted — body IS raw code (no inner widgets), so we
  // keep the covering descriptor + preformatted block. minted's
  // optional `{lang}` argument is included literally for v0.1.
  const body = envBody(props.descriptor.source);
  const envName = envNameOf(props);
  return (
    <Widget {...props} display="inline-block">
      <pre
        style={{
          fontFamily: "monospace",
          fontSize: "0.95em",
          background: COLORS.GRAY_LL,
          padding: "6px 10px",
          borderRadius: 3,
          margin: 0,
          whiteSpace: "pre",
          overflowX: "auto",
          borderLeft: `3px solid ${COLORS.GRAY}`,
        }}
        title={`${envName} env — ${props.descriptor.source.length} chars`}
      >
        {body}
      </pre>
    </Widget>
  );
}
