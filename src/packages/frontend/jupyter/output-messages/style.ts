/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { CSSProperties } from "react";
import { merge } from "@cocalc/util/misc";

export const OUT_STYLE: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordWrap: "break-word",
  fontFamily: "monospace",
  paddingTop: "5px",
  paddingBottom: "5px",
};

export const STDOUT_STYLE: CSSProperties = OUT_STYLE;

export const STDERR_STYLE: CSSProperties = merge(
  { backgroundColor: "#fdd" },
  STDOUT_STYLE,
);

export const TRACEBACK_STYLE: CSSProperties = merge(
  { backgroundColor: "#f9f2f4" },
  OUT_STYLE,
);

export const OUTPUT_STYLE: CSSProperties = {
  flex: 1,
  overflowX: "auto",
  lineHeight: "normal",
  backgroundColor: "#fff",
  border: 0,
  marginBottom: 0,
  marginLeft: "1px",
};

export const OUTPUT_STYLE_SCROLLED: CSSProperties = {
  ...OUTPUT_STYLE,
  // see https://github.com/sagemathinc/cocalc/issues/7293 for something about this:
  maxHeight: "max(24em,60vh)",
};

export const INPUT_STYLE: CSSProperties = {
  padding: "0em 0.25em",
  margin: "0em 0.25em",
};
