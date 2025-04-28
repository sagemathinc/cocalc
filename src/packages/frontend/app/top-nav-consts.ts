/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

// below this, the "page" is considered "narrow" and we use a different style
export const NARROW_THRESHOLD_PX = 550;

// show labels of projects, if there are less than this many
export const HIDE_LABEL_THRESHOLD = 6;

// the width of the top bar
export const NAV_HEIGHT_PX = 36;

// … and on narrower screens, a bit tighter
export const NAV_HEIGHT_NARROW_PX = 28;

export const NAV_CLASS = "hidden-xs";

// top bar font size in icons
// also used for the notification news badge offset, with a minus sign
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
  height: number;
}
