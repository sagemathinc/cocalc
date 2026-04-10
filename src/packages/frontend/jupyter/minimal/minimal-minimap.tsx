/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { List, Map, Set as ImmutableSet } from "immutable";
import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { COLORS } from "@cocalc/util/theme";

const MINIMAP_WIDTH = 44;
const VIEWPORT_MIN_HEIGHT = 12;
const CELL_GAP = 2; // visible gap between cells
const MIN_CELL_HEIGHT = 2;

const CURRENT_COLOR = "#42a5f5"; // blue — matches gutter

type CellStatus = "running" | "queued" | "error" | "stale" | "idle" | "markdown";

function getCellStatus(cell: Map<string, any>): CellStatus {
  const cellType = cell.get("cell_type") || "code";
  if (cellType !== "code") return "markdown";
  const state = cell.get("state");
  if (state === "busy") return "running";
  if (state === "run" || state === "start") return "queued";
  const output = cell.get("output");
  if (output) {
    for (const [, msg] of output) {
      if (msg?.get?.("traceback")) return "error";
    }
  }
  if (!cell.get("exec_count") && !output) return "stale";
  return "idle";
}

const STATUS_COLORS: Record<CellStatus, string> = {
  running: "#5cb85c",
  queued: "#2e7d32",
  error: COLORS.ANTD_RED,
  stale: "#faad14",
  idle: COLORS.GRAY_L,
  markdown: COLORS.GRAY_LL,
};

const DEFAULT_CELL_HEIGHT = 60;

interface MinimalMinimapProps {
  cellList: List<string>;
  cells: Map<string, any>;
  collapsedSections: Set<string>;
  scrollerRef: MutableRefObject<HTMLElement | null>;
  cellHeights: MutableRefObject<{ [index: number]: number }>;
  height: number;
  curId?: string;
  selIds?: ImmutableSet<string>;
}

export const MinimalMinimap: React.FC<MinimalMinimapProps> = React.memo(
  ({ cellList, cells, collapsedSections, scrollerRef, cellHeights, height, curId, selIds }) => {
    const [scrollRatio, setScrollRatio] = useState(0);
    const [viewportRatio, setViewportRatio] = useState(1);
    const minimapRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [dragging, setDragging] = useState(false);
    // Persistent height cache: cellId → last known pixel height
    const heightCacheRef = useRef<{ [id: string]: number }>({});
    // Track cells that were evaluating in the previous render
    const prevEvaluatingRef = useRef<Set<string>>(new Set());

    useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const update = () => {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll <= 0) {
          setScrollRatio(0);
          setViewportRatio(1);
        } else {
          setScrollRatio(el.scrollTop / maxScroll);
          setViewportRatio(Math.min(1, el.clientHeight / el.scrollHeight));
        }
      };
      update();
      el.addEventListener("scroll", update, { passive: true });
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => {
        el.removeEventListener("scroll", update);
        observer.disconnect();
      };
    }, [scrollerRef.current]);

    const minimapHeight = height - 16;
    if (minimapHeight <= 0) return null;

    // Update persistent height cache from Virtuoso measurements.
    // Skip cells that are running/queued or just finished evaluating —
    // Virtuoso may still have a stale mid-evaluation measurement.
    const cache = heightCacheRef.current;
    const prevEval = prevEvaluatingRef.current;
    const currentlyEvaluating = new Set<string>();
    cellList.forEach((id: string, index: number) => {
      const cell = cells.get(id);
      const state = cell?.get("state");
      const isEvaluating = state === "busy" || state === "run" || state === "start";
      if (isEvaluating) {
        currentlyEvaluating.add(id);
      }
      const measured = cellHeights.current[index];
      if (measured != null && measured > 0) {
        // Don't update if cell is evaluating, or just finished (stale measurement)
        const justFinished = prevEval.has(id) && !isEvaluating;
        if (!isEvaluating && !justFinished) {
          cache[id] = measured;
        } else if (!cache[id]) {
          // No cached value at all — use whatever we have
          cache[id] = measured;
        }
      }
    });
    prevEvaluatingRef.current = currentlyEvaluating;

    // Build visible cell entries, respecting collapsed sections
    const entries: {
      id: string;
      pixelHeight: number;
      status: CellStatus;
      isCode: boolean;
      isCurrent: boolean;
      isSelected: boolean;
    }[] = [];

    let inCollapsed = false;
    let collapsedLevel = 0;

    cellList.forEach((id: string) => {
      const cell = cells.get(id);
      if (!cell) return;

      const cellType = cell.get("cell_type") || "code";
      let headingLevel = 0;
      if (cellType === "markdown") {
        const input = (cell.get("input") || "").trimStart();
        const match = input.match(/^(#{1,4})\s/);
        if (match) headingLevel = match[1].length;
      }

      if (headingLevel > 0) {
        if (collapsedSections.has(id)) {
          inCollapsed = true;
          collapsedLevel = headingLevel;
          // Collapsed section: thin marker
          entries.push({
            id,
            pixelHeight: 24,
            status: "markdown",
            isCode: false,
            isCurrent: id === curId,
            isSelected: selIds?.has(id) ?? false,
          });
          return;
        } else if (inCollapsed && headingLevel <= collapsedLevel) {
          inCollapsed = false;
        }
      }

      if (inCollapsed) return;

      entries.push({
        id,
        pixelHeight: cache[id] ?? DEFAULT_CELL_HEIGHT,
        status: getCellStatus(cell),
        isCode: cellType === "code",
        isCurrent: id === curId,
        isSelected: selIds?.has(id) ?? false,
      });
    });

    const totalPixels = entries.reduce((s, e) => s + e.pixelHeight, 0) || 1;
    const scale = minimapHeight / totalPixels;

    // Scroll
    const scrollTo = useCallback(
      (clientY: number) => {
        const el = scrollerRef.current;
        const map = minimapRef.current;
        if (!el || !map) return;
        const rect = map.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        const vpHalf = viewportRatio / 2;
        const targetRatio = Math.max(
          0,
          Math.min(1, (ratio - vpHalf) / Math.max(0.001, 1 - viewportRatio)),
        );
        el.scrollTop = targetRatio * (el.scrollHeight - el.clientHeight);
      },
      [viewportRatio],
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        draggingRef.current = true;
        setDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        scrollTo(e.clientY);
      },
      [scrollTo],
    );
    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (draggingRef.current) scrollTo(e.clientY);
      },
      [scrollTo],
    );
    const handlePointerUp = useCallback(() => {
      draggingRef.current = false;
      setDragging(false);
    }, []);

    const vpTop = scrollRatio * (1 - viewportRatio) * minimapHeight;
    const vpHeight = Math.max(VIEWPORT_MIN_HEIGHT, viewportRatio * minimapHeight);

    return (
      <div
        ref={minimapRef}
        style={{
          position: "relative",
          width: MINIMAP_WIDTH,
          minWidth: MINIMAP_WIDTH,
          height: minimapHeight,
          marginTop: 8,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={(e) => {
          // Forward scroll wheel to the notebook scroller
          const el = scrollerRef.current;
          if (el) el.scrollTop += e.deltaY;
        }}
      >
        {/* Cell bars */}
        {(() => {
          let yOffset = 0;
          return entries.map(({ id, pixelHeight, status, isCode, isCurrent, isSelected }) => {
            const h = Math.max(MIN_CELL_HEIGHT, pixelHeight * scale - CELL_GAP);
            const top = yOffset;
            yOffset += h + CELL_GAP;

            const color = STATUS_COLORS[status];
            const isEval = status === "running" || status === "queued";

            // Running/queued takes precedence over selection highlight
            // so users can see execution progress sweep through
            if (!isEval && (isCurrent || isSelected)) {
              return (
                <div
                  key={id}
                  style={{
                    position: "absolute",
                    top,
                    left: 4,
                    right: 4,
                    height: h,
                    backgroundColor: CURRENT_COLOR,
                    opacity: isCurrent ? 0.8 : 0.5,
                    borderRadius: "1px",
                  }}
                />
              );
            }

            // Markdown cells: narrower, fainter bars
            // Code cells: wider bars with status color
            // Running cell blinks
            return (
              <div
                key={id}
                className={status === "running" ? "minimap-cell-running" : undefined}
                style={{
                  position: "absolute",
                  top,
                  left: isCode ? 4 : 10,
                  right: isCode ? 4 : 10,
                  height: h,
                  backgroundColor: color,
                  opacity: isCode ? 0.6 : 0.3,
                  borderRadius: "1px",
                }}
              />
            );
          });
        })()}

        {/* Viewport rectangle */}
        <div
          style={{
            position: "absolute",
            top: vpTop,
            left: 0,
            right: 0,
            height: vpHeight,
            border: `1.5px solid ${COLORS.GRAY_M}`,
            borderRadius: "2px",
            backgroundColor: "rgba(0,0,0,0.04)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  },
);
