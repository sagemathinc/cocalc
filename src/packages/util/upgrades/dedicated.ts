/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AVG_MONTH_DAYS } from "@cocalc/util/consts/billing";
import {
  DedicatedDiskSpeeds,
  DiskType,
  DISK_NAMES,
  VMsType,
} from "@cocalc/util/types/dedicated";
import { unreachable } from "@cocalc/util/misc";

const VM_FAMILIES = ["n2", "c2", "c2d"] as const;
type VMFamily = typeof VM_FAMILIES[number];

// derive price to charge per day from the base monthly price
export function rawPrice2Retail(p: number, discount = false): number {
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
  const [familyStr, size, cpu_str] = spec.split("-");
  if (!VM_FAMILIES.includes(familyStr as VMFamily)) {
    throw new Error(
      `machine families besides "${VM_FAMILIES}" are not supported -- implement it!`
    );
  }
  const family = familyStr as VMFamily;
  const cpu = parseInt(cpu_str);
  if (typeof cpu !== "number" || cpu <= 0) {
    throw new Error(`core must be 2, 4, 8, ...`);
  }
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

interface DVMPrice {
  mem: number;
  cpu: number;
  family: VMFamily;
}

// calculate the price proportional to cpu and memory
export function getDedicatedVMPrice(opts: DVMPrice): number {
  const { mem, cpu, family } = opts;
  switch (family) {
    case "n2": {
      // N2 machine types: us-east1 and monthly on-demand
      // https://cloud.google.com/compute/vm-instance-pricing#general-purpose_machine_type_family
      const cpu_montly = 23.07603;
      const mem_montly = 3.09301;
      const gcp_price = cpu * cpu_montly + mem * mem_montly;
      return rawPrice2Retail(gcp_price, true);
    }
    case "c2": {
      // Compute optimized C2 machine types: us-east1 and monthly on-demand
      // https://cloud.google.com/compute/vm-instance-pricing#compute-optimized_machine_types
      const cpu_monthly = 24.8054;
      const mem_monthly = 3.3215;
      const gcp_price_c2 = cpu * cpu_monthly + mem * mem_monthly;
      return rawPrice2Retail(gcp_price_c2, true);
    }
    case "c2d": {
      // Compute optimized C2D machine types: us-east1 and monthly on-demand
      // https://cloud.google.com/compute/vm-instance-pricing#compute-optimized_machine_types
      // They (in contrast to c2) do not have any sustianed use discount
      const cpu_monthly = 21.58099;
      const mem_monthly = 2.89007;
      const gcp_price_c2d = cpu * cpu_monthly + mem * mem_monthly;
      return rawPrice2Retail(gcp_price_c2d, false);
    }
    default:
      unreachable(family);
      throw new Error(`family ${family} not supported`);
  }
}

// ATTN: chagnes here have implications for the stripe product ID
// only append values, do not insert them in the middle or the beginning!
const VM_MEM_SIZES = ["standard", "highmem"] as const;

interface SAQOpts {
  family: VMFamily;
  memSize: typeof VM_MEM_SIZES[number];
  cpus: number;
}

// this is used below to avoid wrong values and easier adjustments
function getSpecAndQuota(opts: SAQOpts): NonNullable<VMsType[string]> {
  const { family, memSize, cpus } = opts;
  const spec = `${family}-${memSize}-${cpus}`;
  const midx = VM_MEM_SIZES.indexOf(memSize);
  const data = deriveVMSpecs(spec);
  const quotas = deriveQuotas(data);
  return {
    title: `${quotas.cpu} CPU cores, ${quotas.mem}G RAM`,
    price_day: getDedicatedVMPrice(data),
    spec: quotas, // the spec for actually setting up the container and communicated publicly
    quota: { dedicated_vm: spec },
    // "d"edicated "VM", family n2, "m"emory [index] and "c"pu cores number
    stripeID: `dVM${family}m${midx}c${cpus}`, // partial stripe product id
  };
}

// generate all dedicated VM specs we want to offer
function* getVMData() {
  // N2
  for (const memSize of VM_MEM_SIZES) {
    for (const cpus of [2, 4, 8, 16]) {
      yield getSpecAndQuota({ family: "n2", memSize, cpus });
    }
  }
  // Compute optimized C2 (only standard available)
  {
    const memSize = "standard";
    for (const cpus of [4, 8]) {
      yield getSpecAndQuota({ family: "c2", memSize, cpus });
    }
  }
  // Compute optimized C2D
  for (const memSize of VM_MEM_SIZES) {
    for (const cpus of [2, 4, 8]) {
      yield getSpecAndQuota({ family: "c2d", memSize, cpus });
    }
  }
}

export const VMS: VMsType = {};
for (const vmtype of getVMData()) {
  VMS[vmtype.quota.dedicated_vm] = vmtype;
}

const DISKS: DiskType = {};

// we add a bit for snapshot storage
export const SNAPSHOT_FACTOR = 1.25;

// price numbers are for 1 month and 1024 gb (more significant digits) and zonal storage
const DISK_MONTHLY_1GB: { [id in DedicatedDiskSpeeds]: number } = {
  standard: (SNAPSHOT_FACTOR * 39.76) / 1024,
  balanced: (SNAPSHOT_FACTOR * 102.4) / 1024,
  ssd: (SNAPSHOT_FACTOR * 174.08) / 1024,
} as const;

// https://cloud.google.com/compute/docs/disks/performance#performance_by_disk_size
const IOPS: { [id in DedicatedDiskSpeeds]: { read: number; write: number } } = {
  standard: { read: 0.75, write: 1.5 },
  balanced: { read: 6, write: 6 },
  ssd: { read: 30, write: 30 },
} as const;

// sustained throughput
const MBPS: { [id in DedicatedDiskSpeeds]: { read: number; write: number } } = {
  standard: { read: 0.12, write: 0.12 },
  balanced: { read: 0.28, write: 0.28 },
  ssd: { read: 0.48, write: 0.48 },
} as const;

// below, we define all valid dedicated disk configurations
export const MIN_DEDICATED_DISK_SIZE = 32;
export const MAX_DEDICATED_DISK_SIZE = 1024;
export const DEDICATED_DISK_SIZE_INCREMENT = 32;
export const DEFAULT_DEDICATED_DISK_SIZE =
  MIN_DEDICATED_DISK_SIZE + DEDICATED_DISK_SIZE_INCREMENT;

// this must be kept in sync with the numerical slider in next/store/dedicated
// we also make it readonly to avoid accidental changes
export const DEDICATED_DISK_SIZES: Readonly<number[]> = (function () {
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

// ATTN: do not modify/insert/prepend to this list -- only append
// otherwise you distort the stripe ID!
export const DEDICATED_DISK_SPEEDS: Readonly<DedicatedDiskSpeeds[]> = [
  "standard",
  "balanced",
  "ssd",
] as const;

export const DEFAULT_DEDICATED_DISK_SPEED: DedicatedDiskSpeeds = "standard";

interface DediDiskKeyOpts {
  size_gb: number;
  speed: DedicatedDiskSpeeds;
}

export function getDedicatedDiskKey(opts: DediDiskKeyOpts): string {
  const { size_gb, speed } = opts;
  return `${size_gb}-${speed}`;
}

for (const size_gb of DEDICATED_DISK_SIZES) {
  for (const speed of DEDICATED_DISK_SPEEDS) {
    const quota = {
      dedicated_disk: { size_gb, speed },
    };
    const tIdx = DEDICATED_DISK_SPEEDS.indexOf(speed);
    const title = `${size_gb}G ${DISK_NAMES[speed]}`;
    const key = getDedicatedDiskKey({ size_gb, speed });
    DISKS[key] = {
      quota,
      title,
      price_day: rawPrice2Retail(DISK_MONTHLY_1GB[speed] * size_gb),
      iops: `${size_gb * IOPS[speed].read}/${size_gb * IOPS[speed].write}`,
      mbps:
        `${Math.round(size_gb * MBPS[speed].read)}/` +
        `${Math.round(size_gb * MBPS[speed].write)}`,
      // dedicated "D"isk, "t"ype [number] and "s"ize [number]
      stripeID: `dDt${tIdx}s${size_gb}`,
    };
  }
}

export const DEFAULT_DEDICATED_VM_MACHINE = getSpecAndQuota({
  family: "n2",
  memSize: "highmem",
  cpus: 2,
}).quota.dedicated_vm;

export const PRICES = {
  vms: VMS,
  disks: DISKS,
  disks_monthly: DISK_MONTHLY_1GB,
} as const;
