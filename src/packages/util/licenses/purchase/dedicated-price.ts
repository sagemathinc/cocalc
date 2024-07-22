/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// define structure and prices of dedicated resources
// no sustained use discounts
// "quota" ends up in the license's quota field

import { AVG_MONTH_DAYS, AVG_YEAR_DAYS } from "@cocalc/util/consts/billing";
import { getDedicatedDiskKey, PRICES } from "@cocalc/util/upgrades/dedicated";
import type { DedicatedDisk, DedicatedVM } from "@cocalc/util/types/dedicated";
import dayjs from "dayjs";

interface Props {
  dedicated_vm?: DedicatedVM;
  dedicated_disk?: DedicatedDisk;
  start?: Date;
  end?: Date;
  subscription: "monthly" | "yearly";
}

function getDuration({ start, end, subscription }): number {
  if (start != null && end != null) {
    // length of time in days -- not an integer in general!
    return dayjs(end).diff(dayjs(start), "day", true);
  } else if (subscription === "yearly") {
    return AVG_YEAR_DAYS;
  } else {
    return AVG_MONTH_DAYS;
  }
}

export function dedicatedPrice(info: Props): {
  price: number;
  monthly: number;
} {
  const { dedicated_vm, dedicated_disk, subscription } = info;

  const start = info.start ? new Date(info.start) : undefined;
  const end = info.end ? new Date(info.end) : undefined;

  const duration = getDuration({ start, end, subscription });

  if (!!dedicated_vm) {
    const info = PRICES.vms[dedicated_vm.machine];
    if (info == null) {
      throw new Error(`Dedicated VM "${dedicated_vm}" is not defined.`);
    }
    return {
      price: Math.max(0.01, info.price_day * duration),
      monthly: info.price_day * AVG_MONTH_DAYS,
    };
  } else if (!!dedicated_disk) {
    //console.log(dedicated_disk);
    const diskID = getDedicatedDiskKey(dedicated_disk);
    const info = PRICES.disks[diskID];
    if (info == null) {
      throw new Error(`Dedicated Disk "${dedicated_disk}" is not defined.`);
    }
    return {
      price: Math.max(0.01, info.price_day * duration),
      monthly: info.price_day * AVG_MONTH_DAYS,
    };
  } else {
    throw new Error("Neither VM nor Disk specified!");
  }
}
