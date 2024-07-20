/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { months_before } from "@cocalc/util/misc";

export function course_warning(pay?: Date): boolean {
  if (!pay) {
    return false;
  }
  // require subscription until 3 months after start (an estimate for when
  // class ended, and less than when what student did pay for will have expired).
  return webapp_client.server_time() <= months_before(-3, pay);
}
