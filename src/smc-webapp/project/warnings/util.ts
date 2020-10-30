/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { months_before } from "smc-util/misc";
import { webapp_client } from "../../webapp-client";

export function course_warning(pay?: Date): boolean {
  if (!pay) {
    return false;
  }
  // require subscription until 3 months after start (an estimate for when
  // class ended, and less than when what student did pay for will have expired).
  return webapp_client.server_time() <= months_before(-3, pay);
}

export interface Options {
  upgrades_you_can_use?: any;
  upgrades_you_applied_to_all_projects?: any;
  course_info?: any;
  account_id?: any;
  email_address?: any;
  upgrade_type?: any;
}

export function project_warning_opts({
  upgrades_you_can_use,
  upgrades_you_applied_to_all_projects,
  course_info,
  account_id,
  email_address,
  upgrade_type,
}: Options) {
  const total = upgrades_you_can_use?.[upgrade_type] ?? 0;
  const used = upgrades_you_applied_to_all_projects?.[upgrade_type] ?? 0;
  return {
    total,
    used,
    avail: total - used,
    // no *guarantee* that course_info is immutable.js since just comes from database
    course_warning: course_warning(course_info?.get?.("pay")),
    course_info,
    account_id,
    email_address,
  };
}
