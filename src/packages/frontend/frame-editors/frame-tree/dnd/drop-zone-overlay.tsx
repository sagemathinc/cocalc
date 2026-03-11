/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { COLORS } from "@cocalc/util/theme";
import type { DropZone } from "./use-frame-drop-zone";

interface Props {
  isOver: boolean;
  isDragActive: boolean;
  activeZone: DropZone;
  titleBarHeight?: number;
}

const ZONE_HIGHLIGHT = `${COLORS.ANTD_LINK_BLUE}30`;
const ZONE_BORDER = `2px solid ${COLORS.ANTD_LINK_BLUE}`;
const INACTIVE_BG = `${COLORS.GRAY_L}10`;
const INACTIVE_BORDER = `2px dashed ${COLORS.GRAY_L}`;

const BASE_STYLE: React.CSSProperties = {
  position: "absolute",
  zIndex: 50,
  pointerEvents: "none",
  transition: "all 0.1s ease",
};

const ZONE_STYLE_ACTIVE: React.CSSProperties = {
  ...BASE_STYLE,
  background: ZONE_HIGHLIGHT,
  border: ZONE_BORDER,
  borderRadius: 2,
};

const ZONE_STYLE_INACTIVE: React.CSSProperties = {
  ...BASE_STYLE,
  background: "transparent",
  border: "none",
  borderRadius: 2,
};

function zoneStyle(active: boolean): React.CSSProperties {
  return active ? ZONE_STYLE_ACTIVE : ZONE_STYLE_INACTIVE;
}

export function DropZoneOverlay({
  isOver,
  isDragActive,
  activeZone,
  titleBarHeight = 0,
}: Props) {
  if (!isDragActive) return null;

  if (!isOver) {
    // Show subtle border to indicate this is a valid target
    return (
      <div
        style={{
          ...BASE_STYLE,
          inset: 0,
          background: INACTIVE_BG,
          border: INACTIVE_BORDER,
          borderRadius: 4,
        }}
      />
    );
  }

  return (
    <>
      {/* Tab zone: title bar strip */}
      {titleBarHeight > 0 && (
        <div
          style={{
            ...zoneStyle(activeZone === "tab"),
            top: 0,
            left: 0,
            right: 0,
            height: titleBarHeight,
          }}
        />
      )}
      {/* Top zone: 25% height strip */}
      <div
        style={{
          ...zoneStyle(activeZone === "top"),
          top: titleBarHeight || 0,
          left: 0,
          right: 0,
          height: `calc(25% - ${titleBarHeight}px)`,
        }}
      />
      {/* Bottom zone */}
      <div
        style={{
          ...zoneStyle(activeZone === "bottom"),
          bottom: 0,
          left: 0,
          right: 0,
          height: "25%",
        }}
      />
      {/* Left zone */}
      <div
        style={{
          ...zoneStyle(activeZone === "left"),
          top: "25%",
          bottom: "25%",
          left: 0,
          width: "25%",
        }}
      />
      {/* Right zone */}
      <div
        style={{
          ...zoneStyle(activeZone === "right"),
          top: "25%",
          bottom: "25%",
          right: 0,
          width: "25%",
        }}
      />
      {/* Center zone */}
      <div
        style={{
          ...zoneStyle(activeZone === "center"),
          top: "25%",
          bottom: "25%",
          left: "25%",
          right: "25%",
        }}
      />
    </>
  );
}
