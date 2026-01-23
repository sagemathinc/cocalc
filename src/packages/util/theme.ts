/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Theme configuration file for CoCalc

Copyright 2017, SageMath, Inc. -- ALL RIGHTS RESERVED

This file is not part of the open-source licensed release, because it contains information
specific to the company "SageMath, Inc." and the product "CoCalc".
Upon deployment, please replace this file with a suitable replacement (i.e. come up with your own name, etc.)

This is used mainly in the frontend, but some aspects are also used on the backend.

If you change the colors in this file, you MUST run

   pnpm run update-color-theme

in the src/packages/frontend, then explicitly checkin the updated _colors.sass file.
No part of the CoCalc build process will autogenerate _colors.sass -- you must do
so manually when updating this file.  Why? Because "pnpm run build" on a clean
checkout should not result in any files under revision control changing.
*/

export const SITE_NAME = "CoCalc";
export const COMPANY_NAME = "SageMath, Inc.";
export const COMPANY_EMAIL = "office@sagemath.com";
export const APP_TAGLINE = "Collaborative Calculation";
export const DNS = "cocalc.com";
export const DOMAIN_URL = `https://${DNS}`;
export const DISCUSSION_GROUP =
  "https://groups.google.com/forum/#!forum/cocalc";
export const DOC_URL = "https://doc.cocalc.com/";
export const BLOG_URL = "https://blog.sagemath.com/";
export const LIVE_DEMO_REQUEST =
  "https://docs.google.com/forms/d/e/1FAIpQLSesDZkGD2XVu8BHKd_sPwn5g7MrLAA8EYRTpB6daedGVMTpkA/viewform";
export const HELP_EMAIL = "help@cocalc.com";
export const TWITTER_HANDLE = "cocalc_com"; // without the @
export const BILLING_EMAIL = "billing@sagemath.com";
export const BILLING_TAXID = "TAX EIN: 47-3015407";
// for conversion tracking (commercial only)
export const gtag_id = "AW-943259268";
export const sign_up_id = "44ZfCImosncQhP3jwQM";

// documentation
export const JUPYTER_CLASSIC_MODERN =
  "https://doc.cocalc.com/jupyter.html";

// this is used in packages/hub/email.coffee and hub.coffee to specify the template and ASM groups for sendgrid
export const SENDGRID_TEMPLATE_ID = "0375d02c-945f-4415-a611-7dc3411e2a78";
// asm_group: 699 is for invites https://app.sendgrid.com/suppressions/advanced_suppression_manager
export const SENDGRID_ASM_INVITES = 699;
export const SENDGRID_ASM_NEWSLETTER = 698;

// This is the applications color scheme
const MAIN_COLORS = {
  BLUE_DDD: "#0E2B59",
  BLUE_DD: "#2A5AA6",
  BLUE_D: "#4474c0", // use this for the logo background, etc.
  BLUE: "#6690D2",
  BLUE_L: "#80afff",
  BLUE_LL: "#94B3E5",
  BLUE_LLL: "#c7d9f5",
  BLUE_LLLL: "#e6f4ff",
  BLUE_DOC: "#4375c1", // the blue used in the documentation
  BRWN: "#593E05",
  YELL_D: "#bf7b00",
  YELL_L: "#fbb635",
  YELL_LL: "#fddc7f",
  YELL_LLL: "#fff2d0",
  GRAY_DDD: "#dddddd",
  GRAY_DD: "#303030",
  GRAY_D: "#434343",
  GRAY_M: "#5f5f5f",
  GRAY: "#808080",
  GRAY_L: "#c0c0c0",
  GRAY_L0: "#e0e0e0",
  GRAY_LL: "#eeeeee",
  GRAY_LLL: "#f5f5f5",
  // bootstrap 3 colors
  BS_GREEN_BGRND: "rgb(92,184,92)",
  BS_BLUE_BGRND: "rgb(66, 139, 202)",
  BS_BLUE_TEXT: "rgb(33, 150, 243)",
  BS_GREEN_LL: "#E8F5E9",
  BS_GREEN: "#5CB85C",
  BS_GREEN_D: "#449d44",
  BS_GREEN_DD: "#398439",
  BS_RED: "#dc3545",

  // These were inexplicably in app-framework.ts, so I moved them here.
  BG_RED: "#d9534f", // the red bootstrap color of the button background
  FG_RED: "#c9302c", // red used for text
  FG_BLUE: "#428bca", // blue used for text
  BG_WARNING: "#f0ad4e", // e.g. used for the orange warning when a button is active

  ANTD_LINK_BLUE: "#1677ff", // blue used for links
  ANTD_LINK_BLUE_DARK: "#003eb3", // dark blue used for links

  ANTD_BG_RED_M: "#ff7875",
  ANTD_BG_RED_L: "#fff2f0",
  ANTD_BG_BLUE_L: "#e6f4ff",
  ANTD_RED_WARN: "#f5222d", // used in official docs if there is red text to warn
  ANTD_YELL_M: "#fadb14",

  STAR: "#FFD700", // gold star

  ANTD_RED: "#f5222d", // hefty warning (needs white text on top of it)
  ANTD_ORANGE: "#ffbb96", // mild warning
  ANTD_GREEN: "#87d068", // bright lime-ish green
  ANTD_GREEN_D: "#237804", // dark green

  COCALC_BLUE: "#4474c0", // blue used for the logo
  COCALC_ORANGE: "#fcc861", // orange used for the logo

  ORANGE_WARN: "#FFA500", // e.g. connecting… indicator. use $ANTD_RED_WARN for more severe warnings

  AI_ASSISTANT_BG: "#f6bf61", // e.g. the orange background of the button bar AI button
  AI_ASSISTANT_TXT: "#303030", // the text color for the above
  // a darker variant of AI_ASSISNTANT_BG for text
  AI_ASSISTANT_FONT: "#f0a11d",

  RUN: "#389e0d", // the green color of the run button
} as const;

export const COLORS = {
  ...MAIN_COLORS,

  // The definitions below add semantic meaning by using the colors
  // navigation bar at the top
  TOP_BAR: {
    BG: MAIN_COLORS.GRAY_LL,
    HOVER: MAIN_COLORS.GRAY_LLL,
    ACTIVE: "white",
    TEXT: MAIN_COLORS.GRAY,
    TEXT_ACTIVE: MAIN_COLORS.GRAY_D,
    X: MAIN_COLORS.GRAY,
    X_HOVER: MAIN_COLORS.GRAY_L,
    SIGN_IN_BG: MAIN_COLORS.YELL_L,
  },

  PROJECT: {
    FIXED_LEFT_ACTIVE: MAIN_COLORS.ANTD_LINK_BLUE,
    FIXED_LEFT_OPENED: MAIN_COLORS.ANTD_LINK_BLUE_DARK,
  },

  // landing page
  LANDING: { LOGIN_BAR_BG: MAIN_COLORS.BLUE_D, TOP_BG: MAIN_COLORS.BLUE_LLL },

  TAB: "#333333",

  FILE_ICON: "rgb(66, 139, 202)",

  FILE_EXT: "#999",
  FILE_DIMMED: "#959595",
} as const;
