/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import React, { useCallback, useMemo, useState } from "react";

import { redux, useFrameContext } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { DragHandle } from "@cocalc/frontend/components/sortable-list";
import { COLORS } from "@cocalc/util/theme";
import { SECTION_LINE_WIDTH } from "./styles";

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

/**
 * Cell execution state for gutter line coloring.
 */
export type CellRunState =
  | "idle"
  | "running"
  | "queued"
  | "error"
  | "stale"
  | "markdown";

const RUN_STATE_COLORS: Record<CellRunState, string> = {
  idle: COLORS.GRAY_L0,
  running: "#5cb85c",
  queued: "#2e7d32",       // dark green — waiting to run
  error: COLORS.ANTD_RED,
  stale: COLORS.GRAY_L0,
  markdown: COLORS.GRAY_L0,
};

interface MinimalGutterProps {
  id: string;
  index: number;
  isCode: boolean;
  positionInBlock: number;
  blockSize: number;
  showBlockLine: boolean;

  cellRunState: CellRunState;
  onRun?: () => void;
  onStop?: () => void;
  onInsertCell?: () => void;
  onToggleSection?: () => void;
  blockHighlighted?: boolean;
  onHoverBlock?: (hover: boolean) => void;
  isCurrent?: boolean;
  isSelected?: boolean;
  read_only?: boolean;
  /** Cell execution start timestamp (ms) */
  start?: number;
  /** Cell execution end timestamp (ms) */
  end?: number;
  /** Cell input changed since last execution */
  isDirty?: boolean;
  /** Cell metadata: editable=false */
  isNotEditable?: boolean;
  /** Cell metadata: deletable=false */
  isNotDeletable?: boolean;
}

const CURRENT_COLOR = "#42a5f5"; // blue, same as default notebook

export const MinimalGutter: React.FC<MinimalGutterProps> = React.memo(
  ({
    id,
    index,
    isCode,
    showBlockLine,
    cellRunState,
    onRun,
    onStop,
    onInsertCell,
    onToggleSection,
    blockHighlighted,
    onHoverBlock,

    isCurrent,
    isSelected,
    read_only,
    start,
    end,
    isDirty,
    isNotEditable,
    isNotDeletable,
  }) => {
    const [hovered, setHovered] = useState(false);
    const { project_id, path } = useFrameContext();

    const handleIndexClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const projectActions = redux.getProjectActions(project_id);
        projectActions.toggle_chat({
          path,
          chat_mode: "assistant",
        });
      },
      [project_id, path],
    );

    const lineColor = RUN_STATE_COLORS[cellRunState];

    const runTooltip = useMemo((): React.ReactNode => {
      if (start != null && end != null && end > start) {
        const duration = formatDuration(end - start);
        const ago = formatTimeAgo(new Date(end));
        return (
          <span>
            Took {duration}, {ago}
          </span>
        );
      }
      return "Run this cell";
    }, [start, end]);

    return (
      <DragHandle id={id} style={{ display: "flex", alignSelf: "stretch" }}>
        <div
          style={{
            width: "44px",
            minWidth: "44px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingLeft: "12px",
            paddingTop: "9px",
            userSelect: "none",
            position: "relative",
            backgroundColor: COLORS.GRAY_LLL,
            borderRight: `1px solid ${COLORS.GRAY_LL}`,
            cursor: "grab",
            flex: 1,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Section block line — clickable to collapse section */}
          {showBlockLine && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 3,
                width: SECTION_LINE_WIDTH + 8,
                height: "100%",
                zIndex: 1,
                cursor: "pointer",
                display: "flex",
                justifyContent: "center",
              }}
              onPointerDown={(e) => {
                // Prevent DragHandle from capturing this as a drag
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggleSection?.();
              }}
              onMouseEnter={() => onHoverBlock?.(true)}
              onMouseLeave={() => onHoverBlock?.(false)}
            >
              {/* The visible line — run state color, darker on section hover */}
              <div
                style={{
                  width: SECTION_LINE_WIDTH,
                  height: "100%",
                  backgroundColor:
                    cellRunState === "running" || cellRunState === "queued"
                      ? lineColor
                      : isCurrent || isSelected
                        ? CURRENT_COLOR
                        : blockHighlighted ? COLORS.GRAY_L : lineColor,
                  transition: "background-color 150ms ease",
                }}
              />
            </div>
          )}

          {/* Cell index */}
          <Tooltip
            title={`Reference cell #${index + 1} in AI chat`}
            placement="left"
          >
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleIndexClick}
              style={{
                fontWeight: 600,
                cursor: "pointer",
                zIndex: 2,
                color:
                  cellRunState === "running" || cellRunState === "queued"
                    ? lineColor
                    : isCurrent || isSelected
                      ? CURRENT_COLOR
                      : COLORS.GRAY_D,
              }}
            >
              <span style={{ fontSize: "11px", color: COLORS.GRAY_M, fontWeight: 400 }}>#</span>
              <span style={{ fontSize: "13px" }}>{index + 1}</span>
            </div>
          </Tooltip>

          {/* Lock / protected indicators */}
          {isNotEditable && (
            <Tooltip title="Protected from modifications" placement="left">
              <span style={{ color: COLORS.GRAY_M, fontSize: "12px", zIndex: 2, marginTop: "2px" }}>
                <Icon name="lock" />
              </span>
            </Tooltip>
          )}
          {isNotDeletable && (
            <Tooltip title="Protected from deletion" placement="left">
              <span style={{ color: COLORS.GRAY_M, fontSize: "12px", zIndex: 2, marginTop: "2px" }}>
                <Icon name="ban" />
              </span>
            </Tooltip>
          )}

          {/* Play / Stop button */}
          {isCode && !read_only && onRun && (() => {
            const isBusy = cellRunState === "running" || cellRunState === "queued";
            if (isBusy && onStop) {
              return (
                <Tooltip title="Interrupt execution" placement="left">
                  <Button
                    type="text"
                    size="small"
                    icon={<Icon name="stop" />}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop();
                    }}
                    style={{
                      color: COLORS.ANTD_RED,
                      transition: "color 150ms ease",
                      zIndex: 2,
                    }}
                  />
                </Tooltip>
              );
            }
            return (
              <Tooltip title={runTooltip} placement="left">
                <Button
                  type="text"
                  size="small"
                  icon={<Icon name="play" />}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRun();
                  }}
                  style={{
                    color: hovered ? COLORS.GRAY_D : isDirty ? COLORS.GRAY_M : COLORS.GRAY_L,
                    transition: "color 150ms ease",
                    zIndex: 2,
                  }}
                />
              </Tooltip>
            );
          })()}

          {/* [+] insert cell below — visible on hover for every cell */}
          {!read_only && onInsertCell && (
            <Tooltip title="Insert cell below" placement="right">
              <Button
                type="text"
                size="small"
                icon={<Icon name="plus" />}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onInsertCell();
                }}
                style={{
                  color: COLORS.GRAY_D,
                  marginTop: "auto",
                  transition: "opacity 150ms ease",
                  zIndex: 2,
                  opacity: hovered ? 1 : 0,
                }}
              />
            </Tooltip>
          )}
        </div>
      </DragHandle>
    );
  },
);
