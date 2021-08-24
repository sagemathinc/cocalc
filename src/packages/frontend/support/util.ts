/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export function location(): string {
  return window.location.pathname.slice(appBasePath.length);
}
