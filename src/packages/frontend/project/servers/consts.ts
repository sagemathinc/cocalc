/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

export const TITLE = "Servers";
export const ICON_NAME = "server";

export const TITLE_USERS = "Users";
export const ICON_USERS = "users";

export const ICON_UPGRADES = "gears";
export const TITLE_UPGRADES = "Upgrades";

export const ROOT_STYLE: CSS = {
  paddingLeft: "20px",
  paddingRight: "20px",
  maxWidth: "800px",
} as const;
