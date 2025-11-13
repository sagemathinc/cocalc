/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { join } from "path";

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

// subset of CustomizeState
export interface Customize {
  logo_rectangular: string;
  logo_square: string;
}

export const DEFAULT_CUSTOMIZE: Customize = {
  logo_rectangular: "",
  logo_square: join(appBasePath, "webapp/favicon.ico"),
};
