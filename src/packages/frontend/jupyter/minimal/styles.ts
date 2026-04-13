/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

/** Default (output-wide) flex proportions */
export const OUTPUT_FLEX_DEFAULT = 7;
export const CODE_FLEX_DEFAULT = 3;

/** Editing (code-wide) flex proportions */
export const OUTPUT_FLEX_EDITING = 5;
export const CODE_FLEX_EDITING = 5;

/** Transition duration for column width flip */
export const COLUMN_TRANSITION = "flex-basis 200ms ease, flex-grow 200ms ease";

/** Code preview font scale relative to base */
export const CODE_FONT_SCALE = 0.8;

/** Code preview opacity */
export const CODE_OPACITY_DEFAULT = 0.6;
export const CODE_OPACITY_HOVER = 1.0;

/** Extra top margin for section headings */
export const SECTION_MARGIN: Record<number, number> = {
  1: 32,
  2: 24,
  3: 16,
  4: 12,
};

export const CELL_ROW_STYLE: CSS = {
  display: "flex",
  flexDirection: "row",
  alignItems: "stretch",
  position: "relative",
} as const;

export const SECTION_LINE_COLOR = "var(--cocalc-border, #ccc)";
export const SECTION_LINE_WIDTH = 4;
