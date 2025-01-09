/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

export const TITLE = "Servers";
export const ICON_NAME = "server";

export const ICON_USERS = "users";

export const ICON_UPGRADES = "gears";

export const ROOT_STYLE: CSS = {
  paddingLeft: "20px",
  paddingRight: "20px",
  maxWidth: "1100px",
  margin: "10px auto 0 auto",
} as const;
