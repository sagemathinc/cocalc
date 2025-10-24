/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Main Controls Component for LaTeX Editor Output Panel
Orchestrates build, page navigation, sync, and zoom controls
*/

import { useEffect, useRef, useState } from "react";

import { useRedux } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

import { Actions } from "./actions";
import { BuildControls } from "./output-control-build";
import { PageNavigationControls } from "./output-control-pages";
import { SyncControls } from "./output-control-sync";
import { ZoomControls } from "./output-control-zoom";

const CONTROL_STYLE = {
  padding: "5px 10px",
  borderBottom: `1px solid ${COLORS.GRAY_L}`,
  background: COLORS.GRAY_LL,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: "10px",
} as const;

interface PDFControlsProps {
  actions: Actions;
  id: string;
  totalPages?: number;
  currentPage?: number;
  viewportInfo?: {
    page: number;
    x: number;
    y: number;
  } | null;
  onClearViewportInfo?: () => void;
  pageDimensions?: { width: number; height: number }[];
}

export function PDFControls({
  actions,
  id,
  totalPages = 0,
  currentPage = 1,
  viewportInfo,
  onClearViewportInfo,
  pageDimensions = [],
}: PDFControlsProps) {
  // Get stored current page from local view state, fallback to prop
  const storedCurrentPage =
    useRedux([actions.name, "local_view_state", id, "currentPage"]) ??
    currentPage;

  const containerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const wrapThresholdWidthRef = useRef<number | null>(null);

  // Detect wrapping by monitoring container height changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height, width } = entry.contentRect;

        // Initial height measurement (when not wrapped)
        // We assume single-line height is around 40px (based on padding + button height)
        const singleLineHeight = 40;
        const isWrapped = height > singleLineHeight;

        if (isWrapped && wrapThresholdWidthRef.current === null) {
          // First time wrapping detected - record the width threshold
          wrapThresholdWidthRef.current = width;
          setNarrow(true);
        } else if (isWrapped) {
          // Still wrapped
          setNarrow(true);
        } else if (
          !isWrapped &&
          wrapThresholdWidthRef.current !== null &&
          width > wrapThresholdWidthRef.current + 10
        ) {
          // Unwrapped with buffer - clear narrow mode
          setNarrow(false);
          wrapThresholdWidthRef.current = null;
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={CONTROL_STYLE}
      role="region"
      aria-label="PDF controls"
    >
      {/* Left side: Build Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <BuildControls actions={actions} id={id} narrow={narrow} />
      </div>

      {/* Middle: Page Navigation */}
      {totalPages > 0 && (
        <PageNavigationControls
          actions={actions}
          id={id}
          totalPages={totalPages}
          currentPage={storedCurrentPage}
          narrow={narrow}
        />
      )}

      {/* Sync Controls */}
      <SyncControls
        actions={actions}
        id={id}
        viewportInfo={viewportInfo}
        onClearViewportInfo={onClearViewportInfo}
        pageDimensions={pageDimensions}
        currentPage={storedCurrentPage}
        narrow={narrow}
      />

      {/* Right side: Zoom Controls */}
      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
        <ZoomControls actions={actions} id={id} narrow={narrow} />
      </div>
    </div>
  );
}
