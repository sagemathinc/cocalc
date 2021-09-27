/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// define structure and prices of dedicated resources
// no sustained use discounts
// "quota" ends up in the license's quota field

import {
  DedicatedDiskTypes,
  DISK_NAMES,
} from "@cocalc/util/db-schema/site-licenses";
import { ONE_DAY_MS, AVG_MONTH_DAYS, AVG_YEAR_DAYS } from "./util";

interface VMsType {
  [id: string]: {
    name?: string;
    price_day: number;
    spec: { mem: number; cpu: number };
    quota: { dedicated_vm: string }; // only those defined in VMS below
  };
}

interface DiskType {
  [id: string]: {
    name: string;
    price_day: number;
    quota: { dedicated_disk: { size_gb: number; type: DedicatedDiskTypes } };
  };
}

const DISKS: DiskType = {};

// derive price to chage from raw monthly price
function rawPrice2Retail(p: number): number {
  // factor of 2 and an average month
  return (2 * p) / AVG_MONTH_DAYS;
}

const VMS_DATA: VMsType[string][] = [
  {
    price_day: rawPrice2Retail(95.64),
    spec: { mem: 15, cpu: 2 },
    quota: { dedicated_vm: "n2-standard-2" },
  },
  {
    price_day: rawPrice2Retail(141.79),
    spec: { mem: 15, cpu: 4 },
    quota: { dedicated_vm: "n2-standard-4" },
  },
  {
    price_day: rawPrice2Retail(191.28),
    spec: { mem: 30, cpu: 4 },
    quota: { dedicated_vm: "n2-highmem-4" },
  },
  {
    price_day: rawPrice2Retail(283.58),
    spec: { mem: 30, cpu: 4 },
    quota: { dedicated_vm: "n2-standard-8" },
  },
  {
    price_day: rawPrice2Retail(382.56),
    spec: { mem: 62, cpu: 8 },
    quota: { dedicated_vm: "n2-highmem-8" },
  },
];

const VMS: VMsType = {};

for (const vmtype of VMS_DATA) {
  vmtype.name = `${vmtype.spec.cpu} CPU cores, ${vmtype.spec.mem} GiB RAM`;
  VMS[vmtype.quota.dedicated_vm] = vmtype;
}

// we add a bit for snapshot storage
const SNAPSHOT_FACTOR = 0.25;

// price numbers are for 1 month and 1024 gb (more significant digits) and zonal storage
const DISK_MONTHLY_1GB: { [id in DedicatedDiskTypes]: number } = {
  standard: (SNAPSHOT_FACTOR * 30.96) / 1024,
  balanced: (SNAPSHOT_FACTOR * 102.4) / 1024,
  ssd: (SNAPSHOT_FACTOR * 174.08) / 1024,
};

for (const size_gb of [64, 128, 256]) {
  for (const type of ["standard", "balanced", "ssd"] as DedicatedDiskTypes[]) {
    const quota = {
      dedicated_disk: { size_gb, type },
    };
    const name = `${size_gb} GB ${DISK_NAMES[type]}`;
    const price_day = DISK_MONTHLY_1GB[type] * size_gb;
    DISKS[`${size_gb}-${type}`] = { name, price_day, quota };
  }
}

export const PRICES = {
  vms: VMS,
  disks: DISKS,
} as const;

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
    const info = VMS[dedicated_vm];
    if (info == null) {
      throw new Error(`Dedicated VM "${dedicated_vm}" is not defined.`);
      return info.price_day * duration;
    }
  } else if (!!dedicated_disk) {
    const info = DISKS[dedicated_disk];
    if (info == null) {
      throw new Error(`Dedicated Disk "${dedicated_disk}" is not defined.`);
      return info.price_day * duration;
    }
  } else {
    throw new Error("Neither VM nor Disk specified!");
  }
  return null;
}
