/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";

export const TITLE = "Servers";
export const ICON_NAME = "server";

export const TITLE_COLLABORATORS = "Collaborators";
export const ICON_COLLABORATORS = "users";

export const ICON_LICENSES = "key";
export const TITLE_LICENSES = "Licenses";

export const ROOT_STYLE: CSS = {
  paddingLeft: "20px",
  paddingRight: "20px",
  maxWidth: "800px",
} as const;
