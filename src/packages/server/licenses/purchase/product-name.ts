/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { untangleUptime } from "@cocalc/util/consts/site-license";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { getDays } from "@cocalc/util/stripe/timecalcs";

export function getProductName(info): string {
  /* Similar to getProductId above, but meant to be human readable.  This name is what
       customers see on invoices, so it's very valuable as it reflects what they bought clearly.
    */
  let period: string;
  if (info.subscription == "no") {
    period = `${getDays(info)} days`;
  } else {
    period = "subscription";
  }

  const { always_running, idle_timeout } = untangleUptime(info.custom_uptime);

  let desc = describe_quota({
    user: info.user,
    ram: info.custom_ram,
    cpu: info.custom_cpu,
    dedicated_ram: info.custom_dedicated_ram,
    dedicated_cpu: info.custom_dedicated_cpu,
    disk: info.custom_disk,
    member: info.custom_member,
    always_running,
    idle_timeout,
  });
  desc += " - " + period;
  return desc;
}
