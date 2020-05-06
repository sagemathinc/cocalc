/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { merge } from "smc-util/misc2";

export const OUT_STYLE: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordWrap: "break-word",
  fontFamily: "monospace",
  paddingTop: "5px",
  paddingBottom: "5px",
  paddingLeft: "5px",
};

export const STDOUT_STYLE: React.CSSProperties = OUT_STYLE;

export const STDERR_STYLE: React.CSSProperties = merge(
  { backgroundColor: "#fdd" },
  STDOUT_STYLE
);

export const TRACEBACK_STYLE: React.CSSProperties = merge(
  { backgroundColor: "#f9f2f4" },
  OUT_STYLE
);

export const OUTPUT_STYLE: React.CSSProperties = {
  flex: 1,
  overflowX: "auto",
  lineHeight: "normal",
  backgroundColor: "#fff",
  border: 0,
  marginBottom: 0,
  marginLeft: "1px",
};

export const OUTPUT_STYLE_SCROLLED = merge({ maxHeight: "40vh" }, OUTPUT_STYLE);

export const INPUT_STYLE: React.CSSProperties = {
  padding: "0em 0.25em",
  margin: "0em 0.25em",
};
