/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import React, { useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import { CODE_BAR_BTN_STYLE } from "@cocalc/frontend/jupyter/consts";
import { COLORS } from "@cocalc/util/theme";

/** Section divider row — single hover state across output and code columns */
export function SectionDividerRow({
  isFirst,
  sectionCollapsed,
  sectionTitle,
  onToggle,
  onRunSection,
  showCode,
  codeFlex,
  outputFlex,
  zenMode,
  minimalLayout,
}: {
  isFirst?: boolean;
  sectionCollapsed?: boolean;
  sectionTitle?: string;
  onToggle?: () => void;
  onRunSection?: () => void;
  showCode?: boolean;
  codeFlex: number;
  outputFlex: number;
  zenMode?: boolean;
  minimalLayout?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = hovered ? COLORS.GRAY_LL : COLORS.GRAY_LLL;
  const borderTop = isFirst ? undefined : `1px solid ${COLORS.GRAY_LL}`;
  const borderBottom = `1px solid ${COLORS.GRAY_LL}`;
  const segmentStyle: React.CSSProperties = {
    backgroundColor: bg,
    borderTop,
    borderBottom,
    transition: "background-color 150ms ease",
  };

  return (
    <div
      style={{ display: "flex", cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onToggle}
    >
      {/* Output column side */}
      <div
        style={{
          flex: `${outputFlex} 1 0`,
          display: "flex",
          alignItems: "center",
          minHeight: "24px",
          ...segmentStyle,
        }}
      >
        {/* Gutter-width area with toggle icon */}
        <div style={{
          width: "44px",
          minWidth: "44px",
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          paddingLeft: "2px",
        }}>
          <Icon
            name={sectionCollapsed ? "plus-square" : "minus-square"}
            style={{ color: COLORS.GRAY_M, fontSize: "14px" }}
          />
        </div>
        {/* Title */}
        {sectionCollapsed && sectionTitle ? (
          <span style={{
            color: COLORS.GRAY_D,
            fontSize: "13px",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            padding: "0 8px",
          }}>
            {sectionTitle}
          </span>
        ) : <span style={{ flex: 1 }} />}
        {/* Run button in zen mode (no code column) */}
        {onRunSection && !showCode && (
          <Tooltip title="Run all code cells in this section">
            <Button
              type="text"
              size="small"
              icon={<Icon name="play" />}
              onClick={(e) => {
                e.stopPropagation();
                onRunSection();
              }}
              style={{
                color: COLORS.GRAY_M,
                visibility: hovered ? "visible" : "hidden",
                marginRight: "4px",
              }}
            >
              Run
            </Button>
          </Tooltip>
        )}
      </div>
      {/* Code column side */}
      {showCode && (
        <div
          style={{
            flex: `${codeFlex} 1 0`,
            display: "flex",
            alignItems: "center",
            padding: "0 4px",
            ...segmentStyle,
          }}
        >
          {onRunSection && (
            <Tooltip title="Run all code cells in this section">
              <Button
                type="text"
                size="small"
                icon={<Icon name="play" />}
                onClick={(e) => {
                  e.stopPropagation();
                  onRunSection();
                }}
                style={{
                  ...CODE_BAR_BTN_STYLE,
                  marginLeft: "auto",
                  visibility: hovered ? "visible" : "hidden",
                }}
              >
                Run
              </Button>
            </Tooltip>
          )}
        </div>
      )}
      {/* Empty spacer for zen + non-wide — no background so bar ends at output column */}
      {zenMode && minimalLayout !== "wide" && (
        <div style={{ flex: `${codeFlex} 1 0` }} />
      )}
    </div>
  );
}
