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
import { useAppContext } from "@cocalc/frontend/app/context";
import { hash_string } from "@cocalc/util/misc";
import { getSectionBarBackground } from "./styles";

const MINIMAP_WIDTH = 30;
const VIEWPORT_MIN_HEIGHT = 12;
const CELL_GAP = 2; // visible gap between cells
const MIN_CELL_HEIGHT = 2;

const CURRENT_COLOR = "var(--cocalc-primary, #42a5f5)";
const SELECTED_COLOR = "var(--cocalc-text-primary-strong, #555)";

type CellStatus =
  | "running"
  | "queued"
  | "error"
  | "stale"
  | "idle"
  | "dirty"
  | "markdown";

function getCellStatus(
  cell: Map<string, any>,
  lastExecInputHash: { [id: string]: number },
): CellStatus {
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
  // Cell has been executed — check if input changed since last run
  const id = cell.get("id");
  const snapshotHash = lastExecInputHash[id];
  // Unexecuted or modified cells are "dirty" (darker gray)
  if (!cell.get("exec_count") && !output) return "dirty";
  if (
    snapshotHash !== undefined &&
    snapshotHash !== hash_string(cell.get("input") ?? "")
  ) {
    return "dirty";
  }
  return "idle";
}

const STATUS_COLORS: Record<CellStatus, string> = {
  running: "var(--cocalc-success, #5cb85c)",
  queued: "var(--cocalc-run, #389e0d)",
  error: "var(--cocalc-error, #ff4d4f)",
  stale: "",
  dirty: "",
  idle: "",
  markdown: "",
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
  ({
    cellList,
    cells,
    collapsedSections,
    scrollerRef,
    cellHeights,
    height,
    curId,
    selIds,
  }) => {
    const { isDark } = useAppContext();
    const [scrollRatio, setScrollRatio] = useState(0);
    const [viewportRatio, setViewportRatio] = useState(1);
    const minimapRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [dragging, setDragging] = useState(false);
    // Persistent height cache: cellId → last known pixel height
    const heightCacheRef = useRef<{ [id: string]: number }>({});
    // Track cells that were evaluating in the previous render
    const prevEvaluatingRef = useRef<Set<string>>(new Set());
    // Hash of cell input at time of last execution (for dirty detection)
    const lastExecInputHashRef = useRef<{ [id: string]: number }>({});
    const prevExecCountRef = useRef<{ [id: string]: number }>({});

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

    // Scroll — hooks must be called unconditionally (before any early return)
    const scrollTo = useCallback(
      (clientY: number) => {
        const el = scrollerRef.current;
        const map = minimapRef.current;
        if (!el || !map) return;
        const rect = map.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (clientY - rect.top) / rect.height),
        );
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
      const isEvaluating =
        state === "busy" || state === "run" || state === "start";
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

    // Track exec_count changes to snapshot input hash at execution time
    const lastExecInputHash = lastExecInputHashRef.current;
    const prevExecCounts = prevExecCountRef.current;
    cellList.forEach((id: string) => {
      const cell = cells.get(id);
      if (!cell) return;
      const execCount = cell.get("exec_count");
      if (execCount != null && execCount !== prevExecCounts[id]) {
        // Cell was just executed — snapshot the input hash
        lastExecInputHash[id] = hash_string(cell.get("input") ?? "");
        prevExecCounts[id] = execCount;
      }
    });

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
        status: getCellStatus(cell, lastExecInputHash),
        isCode: cellType === "code",
        isCurrent: id === curId,
        isSelected: selIds?.has(id) ?? false,
      });
    });

    const totalPixels = entries.reduce((s, e) => s + e.pixelHeight, 0) || 1;
    const scale = minimapHeight / totalPixels;

    const vpTop = scrollRatio * (1 - viewportRatio) * minimapHeight;
    const vpHeight = Math.max(
      VIEWPORT_MIN_HEIGHT,
      viewportRatio * minimapHeight,
    );

    return (
      <div
        ref={minimapRef}
        style={{
          position: "relative",
          width: MINIMAP_WIDTH,
          minWidth: MINIMAP_WIDTH,
          height: minimapHeight,
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
          return entries.map(
            ({ id, pixelHeight, status, isCurrent, isSelected }) => {
              const h = Math.max(
                MIN_CELL_HEIGHT,
                pixelHeight * scale - CELL_GAP,
              );
              const top = yOffset;
              yOffset += h + CELL_GAP;

              const color = STATUS_COLORS[status];
              const isEval = status === "running" || status === "queued";
              const neutralColor =
                status === "dirty"
                  ? getSectionBarBackground(isDark, "hover")
                  : status === "markdown"
                    ? getSectionBarBackground(isDark, "base")
                    : getSectionBarBackground(isDark, "mid");

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
                      backgroundColor: isCurrent
                        ? CURRENT_COLOR
                        : SELECTED_COLOR,
                      opacity: isCurrent ? 0.85 : 0.4,
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
                  className={
                    status === "running" ? "minimap-cell-running" : undefined
                  }
                  style={{
                    position: "absolute",
                    top,
                    left: 4,
                    right: 4,
                    height: h,
                    backgroundColor:
                      isEval || status === "error" ? color : neutralColor,
                    opacity: isEval || status === "error" ? 0.8 : 1,
                    borderRadius: "1px",
                  }}
                />
              );
            },
          );
        })()}

        {/* Viewport rectangle */}
        <div
          style={{
            position: "absolute",
            top: vpTop,
            left: 0,
            right: 0,
            height: vpHeight,
            border: `1.5px solid var(--cocalc-border, #666)`,
            borderRadius: "2px",
            backgroundColor: "rgba(0,0,0,0.04)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  },
);
