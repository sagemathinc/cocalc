/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import React, { useCallback, useState } from "react";

import { redux, useFrameContext } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { DragHandle } from "@cocalc/frontend/components/sortable-list";
import { COLORS } from "@cocalc/util/theme";
import { SECTION_LINE_COLOR, SECTION_LINE_WIDTH } from "./styles";

const GUTTER_WIDTH = 44;

/**
 * Cell execution state for gutter line coloring:
 * - "idle": evaluated successfully, no issues
 * - "running": currently executing
 * - "queued": waiting to run
 * - "error": last execution produced a traceback
 * - "stale": has code but never been run, or no exec_count
 * - "markdown": not a code cell
 */
export type CellRunState = "idle" | "running" | "queued" | "error" | "stale" | "markdown";

const RUN_STATE_COLORS: Record<CellRunState, string> = {
  idle: COLORS.GRAY_L,
  running: "#5cb85c",       // green
  queued: "#42a5f5",        // blue
  error: COLORS.ANTD_RED,
  stale: "#faad14",         // warning/amber
  markdown: COLORS.GRAY_L,
};

interface MinimalGutterProps {
  id: string;
  index: number;
  isCode: boolean;
  positionInBlock: number;
  blockSize: number;
  showBlockLine: boolean;
  isLastInBlock: boolean;
  cellRunState: CellRunState;
  onRun?: () => void;
  onInsertCell?: () => void;
  read_only?: boolean;
}

export const MinimalGutter: React.FC<MinimalGutterProps> = React.memo(
  ({
    id,
    index,
    isCode,
    positionInBlock,
    blockSize,
    showBlockLine,
    isLastInBlock,
    cellRunState,
    onRun,
    onInsertCell,
    read_only,
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

    const isFirstInBlock = positionInBlock === 0;

    return (
      <div
        style={{
          width: `${GUTTER_WIDTH}px`,
          minWidth: `${GUTTER_WIDTH}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "4px",
          userSelect: "none",
          position: "relative",
          backgroundColor: COLORS.GRAY_LLL,
          borderRight: `1px solid ${COLORS.GRAY_LL}`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Section block connector line — colored by cell run state */}
        {showBlockLine && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 5,
              width: SECTION_LINE_WIDTH,
              height: "100%",
              backgroundColor: RUN_STATE_COLORS[cellRunState],
              transition: "background-color 300ms ease",
              zIndex: 0,
            }}
          />
        )}

        {/* Cell index — draggable via DragHandle */}
        <DragHandle id={id}>
          <Tooltip
            title={`Reference cell #${index + 1} in AI chat`}
            placement="right"
          >
            <div
              onClick={handleIndexClick}
              style={{
                fontWeight: 600,
                fontSize: "13px",
                color: COLORS.GRAY_D,
                cursor: "grab",
                zIndex: 1,
                padding: "0 4px",
              }}
            >
              #{index + 1}
            </div>
          </Tooltip>
        </DragHandle>

        {/* Play button — always visible for code cells */}
        {isCode && !read_only && onRun && (
          <Tooltip title="Run this cell" placement="right">
            <Button
              type="text"
              size="small"
              icon={<Icon name="play" />}
              onClick={(e) => {
                e.stopPropagation();
                onRun();
              }}
              style={{
                color: hovered ? COLORS.GRAY_D : COLORS.GRAY_L,
                transition: "color 150ms ease",
              }}
            />
          </Tooltip>
        )}

        {/* [+] insert cell at end of section or at bottom */}
        {isLastInBlock && !read_only && onInsertCell && (
          <Tooltip title="Insert cell below" placement="right">
            <Button
              type="text"
              size="small"
              icon={<Icon name="plus" />}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onInsertCell();
              }}
              style={{
                color: hovered ? COLORS.GRAY_D : COLORS.GRAY_LL,
                marginTop: "auto",
                transition: "color 150ms ease",
              }}
            />
          </Tooltip>
        )}
      </div>
    );
  },
);
