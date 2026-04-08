/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";

import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

const DROPDOWN_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "40px",
  width: "100%",
  zIndex: 120,
  background: "var(--cocalc-bg-base, #fff)",
  border: `1px solid ${COLORS.GRAY_L}`,
  borderRadius: "6px",
  boxShadow: `0 8px 16px ${COLORS.GRAY_L}`,
  maxHeight: "30vh",
  overflowY: "auto",
};

interface Props {
  history: string[];
  historyIndex: number;
  setHistoryIndex: (idx: number) => void;
  /** Called with the clicked index so the caller doesn't depend on
   *  `historyIndex` state (which may not be updated yet due to batching). */
  onSelect: (idx: number) => void;
  style?: React.CSSProperties;
}

export const SearchHistoryDropdown: React.FC<Props> = React.memo(
  ({ history, historyIndex, setHistoryIndex, onSelect, style }) => {
    if (history.length === 0) return null;

    return (
      <div style={{ ...DROPDOWN_STYLE, ...style }}>
        {history.map((item, idx) => (
          <div
            key={`${idx}-${item}`}
            ref={
              idx === historyIndex
                ? (el) => el?.scrollIntoView({ block: "nearest" })
                : undefined
            }
            style={{
              alignItems: "center",
              background: idx === historyIndex ? "var(--cocalc-bg-hover, #eee)" : "var(--cocalc-bg-base, #fff)",
              color: "var(--cocalc-text-primary-strong, #333333)",
              cursor: "pointer",
              display: "flex",
              gap: "8px",
              overflow: "hidden",
              padding: "6px 10px",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHistoryIndex(idx)}
            onClick={() => {
              setHistoryIndex(idx);
              onSelect(idx);
            }}
          >
            <Icon name="history" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    );
  },
);
