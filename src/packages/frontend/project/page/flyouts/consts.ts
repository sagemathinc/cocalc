/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

export const DEFAULT_EXT = "ipynb";

export const FLYOUT_DEFAULT_WIDTH_PX: number = 350;
export const FLYOUT_EXTRA_WIDTH_PX = Math.floor(FLYOUT_DEFAULT_WIDTH_PX * 1.1);
export const FLYOUT_EXTRA2_WIDTH_PX = Math.floor(FLYOUT_DEFAULT_WIDTH_PX * 1.4);

// use this in styles for padding or margins
export const FLYOUT_PADDING = "5px";

// a non-standard filetype for a folder
export const ACTIVE_FOLDER_TYPE = "_folder_";

export const PANEL_STYLE_BOTTOM: CSS = {
  width: "100%",
  paddingLeft: "10px",
  paddingRight: "10px",
  paddingBottom: FLYOUT_PADDING,
} as const;

export const PANEL_STYLE_TOP: CSS = {
  width: "100%",
  paddingLeft: FLYOUT_PADDING,
  paddingRight: FLYOUT_PADDING,
  paddingBottom: FLYOUT_PADDING,
};

const PANEL_KEYS = ["selected", "terminal"];
export type PanelKey = (typeof PANEL_KEYS)[number];

// make sure two types of borders are of the same width
export const BORDER_WIDTH_PX = "4px";
