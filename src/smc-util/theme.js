/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Theme configuration file for CoCalc

Copyright 2017, SageMath, Inc. -- ALL RIGHTS RESERVED

This file is not part of the open-source licensed release, because it contains information
specific to the company "SageMath, Inc." and the product "CoCalc".
Upon deployment, please replace this file with a suitable replacement (i.e. come up with your own name, etc.)

This is used mainly in the front-end, but some aspects are also used on the back-end
*/

exports.SITE_NAME = "CoCalc";
exports.COMPANY_NAME = "SageMath, Inc.";
exports.COMPANY_EMAIL = "office@sagemath.com";
exports.APP_TAGLINE = "Collaborative Calculation";
exports.DNS = "cocalc.com";
exports.DOMAIN_URL = `https://${exports.DNS}`;
exports.DISCUSSION_GROUP = "https://groups.google.com/forum/#!forum/cocalc";
exports.DOC_URL = "https://doc.cocalc.com/";
exports.BLOG_URL = "https://blog.sagemath.com/";
exports.LIVE_DEMO_REQUEST =
  "https://docs.google.com/forms/d/e/1FAIpQLSesDZkGD2XVu8BHKd_sPwn5g7MrLAA8EYRTpB6daedGVMTpkA/viewform";
exports.HELP_EMAIL = "help@cocalc.com";
exports.TWITTER_HANDLE = "cocalc_com"; // without the @
exports.BILLING_EMAIL = "billing@sagemath.com";
exports.BILLING_ADDRESS = `\
17725 SE 123RD PL
Renton, WA 98059-6621
USA\
`;
exports.BILLING_TAXID = "TAX EIN: 47-3015407";
exports.COPYRIGHT_AGENT_HTML = `\
William Stein (Copyright Agent)<br>
c/o SageMath, Inc.<br>
17725 SE 123RD PL<br>
Renton, WA 98059-6621<br>
USA<br>
<a href='mailto:copyright@sagemath.com'>copyright@sagemath.com</a>\
`;
// for conversion tracking (commercial only)
exports.gtag_id = "AW-943259268";
exports.sign_up_id = "44ZfCImosncQhP3jwQM";
exports.conversion_id = "zttYCNDZsXcQhP3jwQM";

// documentation
exports.JUPYTER_CLASSIC_MODERN =
  "https://doc.cocalc.com/jupyter.html#classical-versus-cocalc";

// this is used in smc-hub/email.coffee and hub.coffee to specify the template and ASM groups for sendgrid
exports.SENDGRID_TEMPLATE_ID = "0375d02c-945f-4415-a611-7dc3411e2a78";
// asm_group: 699 is for invites https://app.sendgrid.com/suppressions/advanced_suppression_manager
exports.SENDGRID_ASM_INVITES = 699;
exports.SENDGRID_ASM_NEWSLETTER = 698;
exports.DISCORD_INVITE = "https://discord.gg/nEHs2GK";

// This is the applications color scheme
const COLORS = {
  BLUE_DDD: "#0E2B59",
  BLUE_DD: "#2A5AA6",
  BLUE_D: "#4474c0", // use this for the logo background, etc.
  BLUE: "#6690D2",
  BLUE_L: "#80afff",
  BLUE_LL: "#94B3E5",
  BLUE_LLL: "#c7d9f5",
  BLUE_DOC: "#4375c1", // the blue used in the documentation
  BRWN: "#593E05",
  YELL_D: "#bf7b00",
  YELL_L: "#fbb635",
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

  ATND_BG_RED_M: "#ff7875",
  ATND_BG_RED_L: "#fff2f0",
  ANTD_RED_WARN: "#f5222d", // used in official docs if there is red text to warn
  ANTD_YELL_M: "#fadb14",

  ANTD_RED: "#f5222d", // hefty warning (needs white text on top of it)
  ANTD_ORANGE: "#ffbb96", // mild warning
  ANTD_GREEN: "#87d068", // bright lime-ish green
  ANTD_GREEN_D: "#237804", // dark green
};

// The definitions below add semantic meaning by using the colors

// navigation bar at the top
COLORS.TOP_BAR = {
  BG: COLORS.GRAY_LL,
  HOVER: COLORS.GRAY_LLL,
  ACTIVE: "white",
  TEXT: COLORS.GRAY,
  TEXT_ACTIVE: COLORS.GRAY_D,
  X: COLORS.GRAY,
  X_HOVER: COLORS.GRAY_L,
  SIGN_IN_BG: COLORS.YELL_L,
};

// landing page
COLORS.LANDING = { LOGIN_BAR_BG: COLORS.BLUE_D };

exports.COLORS = COLORS;
