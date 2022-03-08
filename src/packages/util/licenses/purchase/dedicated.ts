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

export function dedicatedPrice({
  dedicated_vm,
  dedicated_disk,
  start,
  end,
  subscription,
}): number | null {
  const duration =
    start != null && end != null
      ? (end.getTime() - start.getTime()) / ONE_DAY_MS
      : subscription === "yearly"
      ? AVG_YEAR_DAYS
      : AVG_MONTH_DAYS;
  if (!!dedicated_vm) {
    const info = PRICES.vms[dedicated_vm];
    if (info == null) {
      throw new Error(`Dedicated VM "${dedicated_vm}" is not defined.`);
      return info.price_day * duration;
    }
  } else if (!!dedicated_disk) {
    const info = PRICES.disks[dedicated_disk];
    if (info == null) {
      throw new Error(`Dedicated Disk "${dedicated_disk}" is not defined.`);
      return info.price_day * duration;
    }
  } else {
    throw new Error("Neither VM nor Disk specified!");
  }
  return null;
}
