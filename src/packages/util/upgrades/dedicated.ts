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

type VMFamily = "n2";

// derive price to charge per day from the base monthly price
function rawPrice2Retail(p: number, discount = false): number {
  // factor of 2 and an average month
  // discount factor: for VMs, we pass it on a little bit
  const df = discount ? 90 / 100 : 1;
  return (2 * p * df) / AVG_MONTH_DAYS;
}

// the "per core" unit of memory you get for n2 machine families
function deriveMemBase(size): number {
  switch (size) {
    case "standard":
      return 4;
    case "highmem":
      return 8;
    default:
      throw new Error(`deriveMemBase size "${size}" unknown`);
  }
}

function deriveVMSpecs(spec: string): {
  cpu: number;
  mem: number;
  family: VMFamily;
} {
  const [family, size, cpu_str] = spec.split("-");
  if (family != "n2")
    throw new Error(
      `machine families beside "n2" are not supported -- implement it!`
    );
  const cpu = parseInt(cpu_str);
  if (typeof cpu !== "number" || cpu <= 0)
    throw new Error(`core must be 2, 4, 8, ...`);
  const mem_base = deriveMemBase(size);
  const mem = cpu * mem_base;
  return { family, mem, cpu };
}

// string is like n2-standard-2 or n2-highmem-4
function deriveQuotas({ mem, cpu }): {
  cpu: number;
  mem: number;
} {
  return {
    mem: mem - 2, // 2 GB headroom for services running on that node
    cpu: cpu, // we can safely give all cores to the project
  };
}

// calculate the price proportional to cpu and memory
function getDedicatedVMPrice({ mem, cpu, family }): number {
  switch (family) {
    case "n2":
      // https://cloud.google.com/compute/vm-instance-pricing#general-purpose_machine_type_family
      // N2 machine types: us-east1 and monthly on-demand
      // ATTN: that's with 20% usage discount – we factor it out and discount on our own
      const cpu_montly = 18.46 / 0.8;
      const mem_montly = 2.47 / 0.8;
      const gcp_price = cpu * cpu_montly + mem * mem_montly;
      return rawPrice2Retail(gcp_price, true);
    default:
      throw new Error(`family ${family} not supported`);
  }
}

// this is used below to avoid wrong values and easier adjustments
function getSpecAndQuota(spec: string): NonNullable<VMsType[string]> {
  const data = deriveVMSpecs(spec);
  const quotas = deriveQuotas(data);
  return {
    price_day: getDedicatedVMPrice(data),
    spec: quotas, // the spec for actually setting up the container and communicated publicly
    quota: { dedicated_vm: spec },
  };
}

// generate all dedicated VM specs we want to offer
function* getVMData() {
  const family = "n2";
  for (const size of ["standard", "highmem"]) {
    for (const cpus of [2, 4, 8, 16]) {
      yield getSpecAndQuota(`${family}-${size}-${cpus}`);
    }
  }
}

export const VMS: VMsType = {};
for (const vmtype of getVMData()) {
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

export const MIN_DEDICATED_DISK_SIZE = 32;
export const MAX_DEDICATED_DISK_SIZE = 1024;
export const DEDICATED_DISK_SIZE_INCREMENT = 32;

// this must be kept in sync with the numerical slider in next/stre/dedicated
// we also make it readonly to avoid accidental changes
const DEDICATED_DISK_SIZES: Readonly<number[]> = (function () {
  const v: number[] = [];
  for (
    let i = MIN_DEDICATED_DISK_SIZE;
    i <= MAX_DEDICATED_DISK_SIZE;
    i += DEDICATED_DISK_SIZE_INCREMENT
  ) {
    v.push(i);
  }
  return v;
})();

for (const size_gb of DEDICATED_DISK_SIZES) {
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
