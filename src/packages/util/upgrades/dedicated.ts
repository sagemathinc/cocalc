/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AVG_MONTH_DAYS } from "@cocalc/util/consts/billing";
import {
  DedicatedDiskTypes,
  VMsType,
  DiskType,
  dedicated_disk_display,
} from "@cocalc/util/types/dedicated";

// derive price to charge per day from the base monthly price
function rawPrice2Retail(p: number, discount = false): number {
  // factor of 2 and an average month
  // discount factor: for VMs, we pass it on a little bit
  const df = discount ? 90 / 100 : 1;
  return (2 * p * df) / AVG_MONTH_DAYS;
}

const VMS_DATA: VMsType[string][] = [
  {
    price_day: rawPrice2Retail(70.9, true),
    spec: { mem: 7, cpu: 2 },
    quota: { dedicated_vm: "n2-standard-2" },
  },
  {
    price_day: rawPrice2Retail(95.64, true),
    spec: { mem: 15, cpu: 2 },
    quota: { dedicated_vm: "n2-highmem-2" },
  },
  {
    price_day: rawPrice2Retail(141.79, true),
    spec: { mem: 15, cpu: 4 },
    quota: { dedicated_vm: "n2-standard-4" },
  },
  {
    price_day: rawPrice2Retail(191.28, true),
    spec: { mem: 31, cpu: 4 },
    quota: { dedicated_vm: "n2-highmem-4" },
  },
  {
    price_day: rawPrice2Retail(283.58, true),
    spec: { mem: 31, cpu: 8 },
    quota: { dedicated_vm: "n2-standard-8" },
  },
  {
    price_day: rawPrice2Retail(382.56, true),
    spec: { mem: 62, cpu: 8 },
    quota: { dedicated_vm: "n2-highmem-8" },
  },
  {
    price_day: rawPrice2Retail(567.17, true),
    spec: { mem: 62, cpu: 16 },
    quota: { dedicated_vm: "n2-standard-16" },
  },
  {
    price_day: rawPrice2Retail(765.12, true),
    spec: { mem: 126, cpu: 16 },
    quota: { dedicated_vm: "n2-highmem-16" },
  },
];

export const VMS: VMsType = {};

for (const vmtype of VMS_DATA) {
  vmtype.title = `${vmtype.spec.cpu} CPU cores, ${vmtype.spec.mem} GiB RAM`;
  VMS[vmtype.quota.dedicated_vm] = vmtype;
}

const DISKS: DiskType = {};

// we add a bit for snapshot storage
const SNAPSHOT_FACTOR = 1.25;

// price numbers are for 1 month and 1024 gb (more significant digits) and zonal storage
const DISK_MONTHLY_1GB: { [id in DedicatedDiskTypes]: number } = {
  standard: (SNAPSHOT_FACTOR * 40.96) / 1024,
  balanced: (SNAPSHOT_FACTOR * 102.4) / 1024,
  ssd: (SNAPSHOT_FACTOR * 174.08) / 1024,
};

// https://cloud.google.com/compute/docs/disks/performance#performance_by_disk_size
const IOPS: { [id in DedicatedDiskTypes]: { read: number; write: number } } = {
  standard: { read: 0.75, write: 1.5 },
  balanced: { read: 6, write: 6 },
  ssd: { read: 30, write: 30 },
};

// sustained throughput
const MBPS: { [id in DedicatedDiskTypes]: { read: number; write: number } } = {
  standard: { read: 0.12, write: 0.12 },
  balanced: { read: 0.28, write: 0.28 },
  ssd: { read: 0.48, write: 0.48 },
};

for (const size_gb of [64, 128, 256]) {
  for (const type of ["standard", "balanced", "ssd"] as DedicatedDiskTypes[]) {
    const quota = {
      dedicated_disk: { size_gb, type },
    };
    const title = dedicated_disk_display(quota.dedicated_disk);
    const price_day = rawPrice2Retail(DISK_MONTHLY_1GB[type] * size_gb);
    const iops = `${size_gb * IOPS[type].read}/${size_gb * IOPS[type].write}`;
    const mbps =
      `${Math.round(size_gb * MBPS[type].read)}/` +
      `${Math.round(size_gb * MBPS[type].write)}`;
    DISKS[`${size_gb}-${type}`] = { title, price_day, quota, iops, mbps };
  }
}

export const PRICES = {
  vms: VMS,
  disks: DISKS,
  disks_monthly: DISK_MONTHLY_1GB,
} as const;
