/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React, { useEffect, useRef, useState } from "react";

import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import {
  CODE_FONT_SCALE,
  CODE_OPACITY_DEFAULT,
  CODE_OPACITY_HOVER,
} from "./styles";

const MIN_HEIGHT = 50;

interface MinimalCodePreviewProps {
  value: string;
  cmOptions: { mode?: string | { name?: string }; theme?: string };
  fontSize: number;
  onActivate: () => void;
  /** When true (e.g. row hovered), show at full opacity */
  highlighted?: boolean;
  /** Max height in px — content fades out at the bottom when clipped */
  maxHeight?: number;
}

export const MinimalCodePreview: React.FC<MinimalCodePreviewProps> = React.memo(
  ({ value, cmOptions, fontSize, onActivate, highlighted, maxHeight }) => {
    const [hovered, setHovered] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isClipped, setIsClipped] = useState(false);

    const scaledFontSize = Math.round(fontSize * CODE_FONT_SCALE);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      setIsClipped(el.scrollHeight > el.clientHeight + 2);
    }, [value, maxHeight]);

    return (
      <div
        ref={containerRef}
        style={{
          opacity: hovered || highlighted ? CODE_OPACITY_HOVER : CODE_OPACITY_DEFAULT,
          transition: "opacity 150ms ease",
          cursor: "text",
          position: "relative",
          overflow: "hidden",
          padding: "4px",
          minHeight: `${MIN_HEIGHT}px`,
          maxHeight: maxHeight ? `${Math.max(MIN_HEIGHT, maxHeight)}px` : undefined,
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
            background: "linear-gradient(to right, transparent, var(--cocalc-bg-base, white))",
            pointerEvents: "none",
          }}
        />
        {/* Fade-out on the bottom edge — only when content is clipped */}
        {isClipped && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "100%",
              height: "32px",
              background: "linear-gradient(to bottom, transparent, white)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  },
);
