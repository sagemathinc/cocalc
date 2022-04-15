/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// define structure and prices of dedicated resources
// no sustained use discounts
// "quota" ends up in the license's quota field

import {
  ONE_DAY_MS,
  AVG_MONTH_DAYS,
  AVG_YEAR_DAYS,
} from "@cocalc/util/consts/billing";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import { DedicatedDisk, DedicatedVM } from "../../types/dedicated";

interface Props {
  dedicated_vm?: DedicatedVM;
  dedicated_disk?: DedicatedDisk;
  start?: Date;
  end?: Date;
  subscription: "monthly" | "yearly";
}

export function dedicatedPrice(info: Props): number | null {
  const { dedicated_vm, dedicated_disk, subscription } = info;

  // at this point, we assume the start/end dates are already
  // set to the start/end time of a day in the user's timezone.
  const start = info.start ? new Date(info.start) : undefined;
  const end = info.end ? new Date(info.end) : undefined;

  const duration =
    start != null && end != null
      ? (end.getTime() - start.getTime()) / ONE_DAY_MS
      : subscription === "yearly"
      ? AVG_YEAR_DAYS
      : AVG_MONTH_DAYS;
  if (!!dedicated_vm) {
    const info = PRICES.vms[dedicated_vm.machine];
    if (info == null) {
      throw new Error(`Dedicated VM "${dedicated_vm}" is not defined.`);
    }
    return info.price_day * duration;
  } else if (!!dedicated_disk) {
    const diskID = `${dedicated_disk.size_gb}-${dedicated_disk.speed}`;
    const info = PRICES.disks[diskID];
    if (info == null) {
      throw new Error(`Dedicated Disk "${dedicated_disk}" is not defined.`);
    }
    return info.price_day * duration;
  } else {
    throw new Error("Neither VM nor Disk specified!");
  }
}
