/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

// show labels of projects, if there are less than this many
export const HIDE_LABEL_THRESHOLD = 6;

// the width of the top bar
export const NAV_HEIGHT_PX = 36;

export const NAV_CLASS = "hidden-xs";

// top bar font size in icons
export const FONT_SIZE_ICONS_NARROW = "14px";
export const FONT_SIZE_ICONS_NORMAL = "20px";

// used in several places, especially for *:hover
export const TOP_BAR_ELEMENT_CLASS = "cocalc-top-bar-element";

export interface PageStyle {
  topBarStyle: CSS;
  fileUseStyle: CSS;
  projectsNavStyle: CSS | undefined;
  fontSizeIcons: string; // {n}px
  topPaddingIcons: string; // {n}px
  sidePaddingIcons: string; // {n}px
  isNarrow: boolean;
}
