/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

import type { IconName } from "@cocalc/frontend/components/icon";

export const TITLE = "Servers";
export const ICON_NAME: IconName = "server";

export const ICON_USERS: IconName = "users";

export const ICON_UPGRADES: IconName = "gears";

export const ROOT_STYLE: CSS = {
  paddingLeft: "20px",
  paddingRight: "20px",
  maxWidth: "1100px",
  margin: "10px auto 0 auto",
} as const;
