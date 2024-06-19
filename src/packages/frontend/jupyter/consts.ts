import { CSS } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

export const CODE_BAR_BTN_STYLE: CSS = {
  fontSize: "12px",
  color: COLORS.GRAY_M,
} as const;

export const MINI_BUTTONS_STYLE_INNER: CSS = {
  display: "flex",
  gap: "3px",
  alignItems: "flex-start",
  justifyContent: "flex-end",
  ...CODE_BAR_BTN_STYLE,
  //   borderTop: `1px solid ${COLORS.GRAY_L}`,
  //   borderLeft: `1px solid ${COLORS.GRAY_L}`,
  //   borderRight: `1px solid ${COLORS.GRAY_L}`,
  //   borderRadius: "3px 3px 3px 0",
} as const;

export const RUN_ALL_CELLS_ABOVE_ICON = "vertical-align-bottom";
export const RUN_ALL_CELLS_BELOW_ICON = "angle-double-right"; // and 90°
export const DELETE_CELL_ICON = "trash";
export const COPY_CELL_ICON = "files";
export const SPLIT_CELL_ICON = "horizontal-split";
