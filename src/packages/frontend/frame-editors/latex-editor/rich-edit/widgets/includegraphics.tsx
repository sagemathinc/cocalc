/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
\includegraphics[opts]{path}

Renders the image inline via cocalc's raw_url helper, resolving the
image path relative to the .tex file's directory. The image's width
is the first thing pulled from `opts`:
  width=N\textwidth  → CSS `width: (N*100)%`
  width=N\linewidth  → same
  width=Ncm/in/mm/px → mapped to a px equivalent (rough conversion)
  no width opt       → defaults to 80% width

Centering, captions, figure float (`[h!]`), and the rest of the
opts list are NOT honored — they're preserved in the source (and
visible on hover) but visually inert here. Editing the source is
how you tweak them for v0.1; richer in-widget controls are a Phase
6.3 idea.

Auto-extension resolution (writing `\includegraphics{logo}` and
expecting LaTeX to find `logo.png`) is NOT done — the path is
loaded verbatim. If the image fails to load, the widget shows a
muted "image not found" placeholder so the user can hover and
inspect the source.
*/

import { useState } from "react";

import { path_split } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import { raw_url } from "../../../frame-tree/util";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { WidgetProps } from "../types";
import { Widget } from "./common";

interface ResolvedWidth {
  /** CSS `width` string, e.g. `"50%"` or `"300px"`. */
  width: string;
}

function parseWidth(options: string): ResolvedWidth {
  // Try `width=0.5\textwidth` / `\linewidth`.
  const widthMatch = options.match(
    /width\s*=\s*(\d*\.?\d+)\s*\\(textwidth|linewidth|columnwidth)/,
  );
  if (widthMatch != null) {
    const n = parseFloat(widthMatch[1]);
    return { width: `${Math.min(100, Math.round(n * 100))}%` };
  }
  // Try `width=300px` / `cm` / `mm` / `in`.
  const absMatch = options.match(/width\s*=\s*(\d*\.?\d+)\s*(cm|mm|in|px|pt)/);
  if (absMatch != null) {
    const n = parseFloat(absMatch[1]);
    const unit = absMatch[2];
    let px: number;
    switch (unit) {
      case "cm":
        px = n * 37.795; // approx
        break;
      case "mm":
        px = n * 3.7795;
        break;
      case "in":
        px = n * 96;
        break;
      case "pt":
        px = n * 1.333;
        break;
      default:
        px = n;
    }
    return { width: `${Math.round(px)}px` };
  }
  // Default.
  return { width: "80%" };
}

function resolveImageUrl(
  projectId: string,
  texPath: string,
  imgRef: string,
): string {
  if (imgRef.startsWith("/")) {
    return raw_url(projectId, imgRef);
  }
  const texDir = path_split(texPath).head;
  const resolved = texDir !== "" ? `${texDir}/${imgRef}` : imgRef;
  return raw_url(projectId, resolved);
}

const PLACEHOLDER_STYLE = {
  display: "inline-block",
  padding: "12px 18px",
  background: COLORS.GRAY_LLL,
  border: `1px dashed ${COLORS.GRAY_L}`,
  borderRadius: 4,
  color: COLORS.GRAY_M,
  fontFamily: "sans-serif",
  fontSize: "0.85em",
  fontStyle: "italic",
} as const;

export function Includegraphics(props: WidgetProps) {
  const { project_id, path } = useFrameContext();
  const imgRef = (props.descriptor.payload?.path as string | undefined) ?? "";
  const options =
    (props.descriptor.payload?.options as string | undefined) ?? "";
  const [errored, setErrored] = useState(false);

  const { width } = parseWidth(options);
  const url = imgRef ? resolveImageUrl(project_id, path, imgRef) : "";

  return (
    <Widget {...props} display="inline-block">
      {imgRef === "" || errored ? (
        <span style={PLACEHOLDER_STYLE}>
          {imgRef === ""
            ? "(empty includegraphics)"
            : `image not found: ${imgRef}`}
        </span>
      ) : (
        <img
          src={url}
          alt={imgRef}
          onError={() => setErrored(true)}
          // The widget DOM goes inside a CM line slot. We use
          // `inline-block` (set by the Widget wrapper above) so the
          // image collapses to its content size; max-width prevents
          // huge images from overflowing the editor.
          style={{
            width,
            maxWidth: "100%",
            height: "auto",
            verticalAlign: "middle",
          }}
        />
      )}
    </Widget>
  );
}
