/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DOMAIN_URL } from "smc-util/theme";

// this BASE_URL really is the base *url* -- it starts with http,
// and does NOT end with /
export let BASE_URL: string;

try {
  // note that window.location.origin includes the port, so critical to use that!
  BASE_URL = window.location.origin;
  if (window.app_base_path.length > 1) {
    BASE_URL += window.app_base_path;
  }
} catch (_err) {
  // backend server
  BASE_URL = DOMAIN_URL;
}
