/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { COLORS } from "@cocalc/util/theme";

export const STYLE_LOADING: React.CSSProperties = {
  margin: "auto",
} as const;

export const STYLE_HEADER: React.CSSProperties = {
  margin: "1rem 1rem 0 1rem",
  borderBottom: `1px solid ${COLORS.GRAY}`,
  color: COLORS.GRAY,
  fontSize: "inherit",
} as const;

export const STYLE_OUTER: React.CSSProperties = {
  display: "flex",
  flex: "1 1 auto",
  flexDirection: "column",
  overflow: "auto",
} as const;

export const STYLE_LOG: React.CSSProperties = {
  alignSelf: "flex-start",
  width: "100%",
} as const;

export const STYLE_PRE: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  margin: "0",
  borderRadius: "0",
  border: "0",
  backgroundColor: "inherit",
  fontSize: "inherit",
} as const;

export const STYLE_ERR: React.CSSProperties = {
  ...STYLE_LOG,
  fontWeight: "bold",
  backgroundColor: COLORS.ANTD_BG_RED_L,
} as const;
