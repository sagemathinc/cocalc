/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DOMAIN_NAME } from "../../smc-util/theme";
import { join } from "path";

export const APP_BASE_URL = (window as any)?.app_base_url ?? "";

const BASE_PATH = join(window.location.hostname, APP_BASE_URL);
export const BASE_URL =
  window != null ? `${window.location.protocol}//${BASE_PATH}` : DOMAIN_NAME;
