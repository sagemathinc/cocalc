/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React, { useState } from "react";

import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import {
  CODE_FONT_SCALE,
  CODE_OPACITY_DEFAULT,
  CODE_OPACITY_HOVER,
} from "./styles";

interface MinimalCodePreviewProps {
  value: string;
  cmOptions: { mode?: string | { name?: string }; theme?: string };
  fontSize: number;
  onActivate: () => void;
  /** When true (e.g. row hovered), show at full opacity */
  highlighted?: boolean;
}

export const MinimalCodePreview: React.FC<MinimalCodePreviewProps> = React.memo(
  ({ value, cmOptions, fontSize, onActivate, highlighted }) => {
    const [hovered, setHovered] = useState(false);

    const scaledFontSize = Math.round(fontSize * CODE_FONT_SCALE);

    return (
      <div
        style={{
          opacity: hovered || highlighted ? CODE_OPACITY_HOVER : CODE_OPACITY_DEFAULT,
          transition: "opacity 150ms ease",
          cursor: "text",
          position: "relative",
          overflow: "hidden",
          padding: "4px",
        }}
        onClick={onActivate}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <CodeMirrorStatic
          value={value}
          options={{ ...cmOptions, lineWrapping: false }}
          font_size={scaledFontSize}
          no_border
          style={{
            background: "transparent",
            padding: "2px 4px",
            whiteSpace: "pre",
            overflow: "hidden",
          }}
        />
        {/* Fade-out on the right edge */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "32px",
            height: "100%",
            background: "linear-gradient(to right, transparent, white)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  },
);
